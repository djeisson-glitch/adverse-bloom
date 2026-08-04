import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// orcamento-resumo — resumo enxuto do job, pra dentro e pra fora
//
// A DIVISÃO DE TRABALHO É O PONTO: os NÚMEROS são contados aqui, em código;
// a IA só escreve o parágrafo em cima deles. Modelo de linguagem redige bem
// e conta mal — um resumo que erra o tamanho da equipe ou o número de
// diárias é pior que resumo nenhum, porque vai junto pro cliente e pro
// mentor com cara de verdade conferida.
//
// Pessoas saem das categorias PRODUÇÃO, EQUIPE TÉCNICA e ELENCO, somando a
// quantidade de cada linha. As funções contadas voltam na resposta pra tela
// poder mostrar de onde veio o número — conta que não dá pra conferir é
// conta que ninguém usa.
//
// Chave no servidor (ANTHROPIC_API_KEY), como no mergulho-ia. Só quem já
// pode ver dinheiro gera resumo: o texto fala de escopo, mas o gatilho lê a
// planilha inteira.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Categorias cujas linhas representam GENTE (o resto é carro, comida, câmera). */
const CAT_EQUIPE = ["003", "007"];
const CAT_ELENCO = ["006"];
const CAT_POS = ["011"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { budget_id } = await req.json();
    if (!budget_id) return json({ error: "Informe budget_id" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Faça login" }, 401);

    const { data: podeVer } = await supabase.rpc("pode_ver_dinheiro");
    if (!podeVer) return json({ error: "Sem permissão" }, 403);

    // ---------------------------------------------------------- os fatos
    const { data: budget } = await supabase
      .from("budgets")
      .select("id, deal_id, entregas, total_value")
      .eq("id", budget_id)
      .maybeSingle();
    if (!budget) return json({ error: "Orçamento não encontrado" }, 404);

    const { data: deal } = await supabase
      .from("deals")
      .select("title, objetivo, tipo_orcamento, local_filmagem, formatos, client_id")
      .eq("id", budget.deal_id)
      .maybeSingle();

    const { data: cliente } = deal?.client_id
      ? await supabase.from("clients").select("name").eq("id", deal.client_id).maybeSingle()
      : { data: null };

    const { data: itens } = await supabase
      .from("budget_items")
      .select("descricao, item_name, quantity, diaria, client_unit_price, categoria_id")
      .eq("budget_id", budget_id);

    const { data: cats } = await supabase.from("budget_categorias").select("id, codigo, nome");
    const codigoDe = new Map((cats || []).map((c: any) => [c.id, c.codigo]));

    const linhas = (itens || []).filter(
      (i: any) => Number(i.quantity || 0) * Number(i.diaria ?? 1) * Number(i.client_unit_price || 0) > 0,
    );

    const contar = (codigos: string[]) => {
      const alvo = linhas.filter((i: any) => codigos.includes(codigoDe.get(i.categoria_id) || ""));
      return {
        pessoas: alvo.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0),
        funcoes: alvo.map((i: any) => ({
          nome: i.descricao || i.item_name,
          qtd: Number(i.quantity || 0),
          diarias: Number(i.diaria ?? 1),
        })),
      };
    };

    const equipe = contar(CAT_EQUIPE);
    const elenco = contar(CAT_ELENCO);

    // Diárias de filmagem = o maior número de diárias entre as linhas de
    // gente. Somar daria "18 diárias" para 6 pessoas × 3 dias, que é
    // diária-pessoa, não dia de set — e é dia de set que se quer saber.
    const diarias = [...equipe.funcoes, ...elenco.funcoes]
      .reduce((max: number, f: any) => Math.max(max, f.diarias), 0);

    // Na pós a coluna "diária" é HORA (o editor troca o rótulo).
    const horasPos = linhas
      .filter((i: any) => CAT_POS.includes(codigoDe.get(i.categoria_id) || ""))
      .reduce((s: number, i: any) => s + Number(i.quantity || 0) * Number(i.diaria ?? 1), 0);

    const entregas = Array.isArray(budget.entregas) ? budget.entregas : [];

    const numeros = {
      pessoas: equipe.pessoas + elenco.pessoas,
      equipe: equipe.pessoas,
      elenco: elenco.pessoas,
      diarias,
      horas_pos: horasPos,
      entregas: entregas.reduce((s: number, e: any) => s + (Number(e.quantidade) || 0), 0),
      locacao: deal?.local_filmagem || null,
      funcoes: [...equipe.funcoes, ...elenco.funcoes],
    };

    // ------------------------------------------------------------- a IA
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA não configurada (falta ANTHROPIC_API_KEY)." }, 503);
    const model = Deno.env.get("CLAUDE_MODEL") || "claude-opus-4-8";

    const listaEntregas = entregas.length
      ? entregas
          .map((e: any) =>
            `${e?.quantidade || 1}× ${e?.titulo || "peça"}${e?.formato ? ` (${e.formato}` : ""}${e?.duracao ? `, ${e.duracao})` : e?.formato ? ")" : ""}`)
          .join("; ")
      : "(escopo de entregas não preenchido)";

    const prompt = `Você escreve o resumo executivo de um job de produtora audiovisual.

DADOS JÁ CONFERIDOS (use exatamente estes números, não recalcule nem invente):
- Job: ${deal?.title || "sem título"}
- Cliente: ${cliente?.name || "não informado"}
- Tipo: ${deal?.tipo_orcamento || "não informado"}
- Locação: ${numeros.locacao || "não informada"}
- Pessoas: ${numeros.pessoas} (${numeros.equipe} de equipe, ${numeros.elenco} de elenco)
- Diárias de filmagem: ${numeros.diarias}
- Horas de pós-produção: ${numeros.horas_pos}
- Entregas: ${listaEntregas}
- Funções orçadas: ${numeros.funcoes.map((f: any) => `${f.qtd}× ${f.nome}`).join(", ") || "nenhuma"}

BRIEFING DO CLIENTE:
${deal?.objetivo || "(não preenchido)"}

Escreva um resumo de 3 a 4 frases dizendo o que é o job, o que será entregue e
o tamanho da operação. Português do Brasil, direto, sem adjetivo vazio, sem
"solução inovadora" nem "conteúdo de alto impacto". Não repita o valor do
orçamento. Não invente nada que não esteja acima — se o briefing está vazio,
descreva só o que os números mostram.

Responda APENAS com JSON válido:
{"texto":"...","destaques":["...","...","..."]}

Os destaques são 2 a 4 fatos curtos (máx. 8 palavras cada) que alguém precisa
saber de relance. Ex.: "3 diárias em Passo Fundo", "41h de pós".`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const erro = await resp.text();
      return json({ error: `IA recusou: ${erro.slice(0, 200)}` }, 502);
    }

    const data = await resp.json();
    const bruto = (data?.content?.[0]?.text || "").trim();
    // O modelo às vezes embrulha em ```json — pega o primeiro objeto e pronto.
    const inicio = bruto.indexOf("{");
    const fim = bruto.lastIndexOf("}");
    let parsed: any = {};
    try {
      parsed = JSON.parse(bruto.slice(inicio, fim + 1));
    } catch {
      return json({ error: "IA respondeu num formato inesperado. Tente de novo." }, 502);
    }

    const resumo = {
      texto: (parsed.texto || "").toString(),
      destaques: Array.isArray(parsed.destaques) ? parsed.destaques.map(String).slice(0, 4) : [],
      numeros,
      gerado_em: new Date().toISOString(),
      gerado_por: user.id,
    };

    const { error: erroSalvar } = await supabase
      .from("budgets")
      .update({ resumo_ia: resumo })
      .eq("id", budget_id);
    if (erroSalvar) return json({ error: `Gerou mas não salvou: ${erroSalvar.message}` }, 500);

    return json({ resumo });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
