import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// sugerir-itens-orcamento — a IA lê briefing/roteiro/tratamento e sugere
// QUAIS LINHAS entram na planilha (diárias, gente, logística, horas de pós).
//
// Djêisson (10/09): "não sugira valores, os valores eu coloco depois. o
// importante é o sistema... sugerir a quantidade de diárias, horas de pós,
// logística e etc." — por isso o prompt proíbe preço explicitamente e o
// parser nem lê campo de valor da resposta, mesmo que a IA insista em mandar
// um. Cabe à pessoa decidir quanto cobrar; a IA só decide ESCOPO.
//
// Mesma chave de servidor (ANTHROPIC_API_KEY) e mesmo gate por
// pode_ver_dinheiro que orcamento-resumo — a planilha é dado sensível mesmo
// sem preço (ela expõe operação, fornecedor, tamanho de equipe).
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

/** Espelha o seed de budget_categorias — se um código novo nascer no banco,
 * a IA ainda pode citá-lo (a validação abaixo aceita qualquer código que
 * exista de fato na tabela, esta lista é só o texto que vai no prompt). */
const CATALOGO_CATEGORIAS = `001 PRÉ-PRODUÇÃO
002 TESTE DE VT
003 PRODUÇÃO
004 TRANSPORTE
005 PASSAGEM E HOSPEDAGEM
006 ELENCO
007 EQUIPE TÉCNICA
008 EQUIPAMENTOS
009 ALIMENTAÇÃO
010 ARTE / FIGURINO
011 PÓS-PRODUÇÃO`;

const LABELS_MERGULHO: Record<string, string> = {
  marca: "Sobre a marca/empresa",
  objetivo: "Objetivo do projeto",
  publico: "Público",
  mensagem: "Mensagem-chave",
  tom: "Tom e referências",
  veiculacao: "Onde vai ser veiculado",
  nao_pode_faltar: "O que não pode faltar",
  materiais: "Materiais que já têm",
  verba_prazo: "Verba e prazo (aproximados)",
};

function dumpMergulho(m: Record<string, any>): string {
  if (!m || typeof m !== "object") return "(briefing aprofundado não preenchido)";
  const linhas: string[] = [];
  for (const [key, label] of Object.entries(LABELS_MERGULHO)) {
    const t = (m[key] ?? "").toString().trim();
    if (t) linhas.push(`- ${label}: ${t}`);
  }
  const entregas = Array.isArray(m.entregas) ? m.entregas : [];
  if (entregas.length) {
    linhas.push(
      `- Entregas: ${entregas
        .map((e: any) => `${e?.titulo || "peça"}${e?.formato ? ` · ${e.formato}` : ""}${e?.duracao ? ` · ${e.duracao}` : ""}`)
        .join("; ")}`,
    );
  }
  return linhas.length ? linhas.join("\n") : "(briefing aprofundado não preenchido)";
}

/** O que a API da Anthropic lê nativamente. Word e texto puro chegam já
 * convertidos em texto pelo navegador (dentro de `texto`). */
const TIPOS_ANEXO: Record<string, "document" | "image"> = {
  "application/pdf": "document",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
};
const MAX_ANEXOS = 10;
// Base64 somado. A API aceita até 32 MB por requisição; a folga cobre o texto.
const MAX_BASE64 = 24 * 1024 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { budget_id, texto, anexos: anexosBrutos } = await req.json().catch(() => ({}));
    if (!budget_id) return json({ error: "Informe budget_id" }, 400);

    const anexos: { nome: string; media_type: string; base64: string }[] =
      Array.isArray(anexosBrutos) ? anexosBrutos : [];
    if (anexos.length > MAX_ANEXOS) {
      return json({ error: `No máximo ${MAX_ANEXOS} arquivos por vez.` }, 400);
    }
    for (const a of anexos) {
      if (!TIPOS_ANEXO[a?.media_type] || typeof a?.base64 !== "string" || !a.base64) {
        return json({ error: `Formato não suportado: ${a?.nome || "arquivo"}. Use PDF, imagem, Word ou texto.` }, 400);
      }
    }
    if (anexos.reduce((s, a) => s + a.base64.length, 0) > MAX_BASE64) {
      return json({ error: "Os arquivos juntos passam de ~18 MB. Mande menos de uma vez ou só as páginas que importam." }, 400);
    }

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

    const { data: budget } = await supabase
      .from("budgets")
      .select("id, deal_id, entregas")
      .eq("id", budget_id)
      .maybeSingle();
    if (!budget) return json({ error: "Orçamento não encontrado" }, 404);

    const { data: deal } = await supabase
      .from("deals")
      .select("title, objetivo, tipo_orcamento, local_filmagem, formatos, mergulho")
      .eq("id", budget.deal_id)
      .maybeSingle();

    const textoExtra = (texto || "").toString().trim();
    if (textoExtra.length > 400_000) {
      return json({ error: "Texto longo demais (passa de ~400 mil caracteres). Mande só as partes que definem o escopo." }, 400);
    }
    const objetivo = (deal?.objetivo || "").toString().trim();
    const mergulho = (deal?.mergulho && typeof deal.mergulho === "object" ? deal.mergulho : {}) as Record<string, any>;
    const temMergulho = Object.keys(mergulho).length > 0;

    if (!textoExtra && !anexos.length && !objetivo && !temMergulho) {
      return json({
        error: "Sem informação pra trabalhar — escreva, cole um texto ou anexe um arquivo (roteiro, tratamento, briefing).",
      }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA não configurada (falta ANTHROPIC_API_KEY)." }, 503);
    const model = Deno.env.get("CLAUDE_MODEL") || "claude-opus-4-8";

    const entregas = Array.isArray(budget.entregas) ? budget.entregas : [];
    const listaEntregas = entregas.length
      ? entregas
          .map((e: any) =>
            `${e?.quantidade || 1}× ${e?.titulo || "peça"}${e?.formato ? ` (${e.formato}` : ""}${e?.duracao ? `, ${e.duracao})` : e?.formato ? ")" : ""}`)
          .join("; ")
      : "(escopo de entregas não preenchido)";

    const prompt = `Você é o orçamentista de uma produtora audiovisual brasileira. Com base nas informações abaixo sobre um projeto, sugira quais ITENS DE ESCOPO — não valores — provavelmente entram no orçamento de produção.

PROJETO: ${deal?.title || "sem título"}
TIPO DE ORÇAMENTO: ${deal?.tipo_orcamento || "não informado"}
LOCAL DE FILMAGEM: ${deal?.local_filmagem || "não informado"}
FORMATOS: ${Array.isArray(deal?.formatos) ? deal.formatos.join(", ") : (deal?.formatos || "não informado")}

OBJETIVO (briefing curto):
${objetivo || "(não preenchido)"}

BRIEFING APROFUNDADO (Mergulho):
${dumpMergulho(mergulho)}

ENTREGAS PREVISTAS:
${listaEntregas}

ARQUIVOS ANEXADOS AGORA (estão acima desta mensagem — roteiro, tratamento, briefing, decupagem, prints; leia com atenção, costumam ser a fonte mais completa):
${anexos.length ? anexos.map((a, i) => `${i + 1}. ${a.nome || "arquivo"}`).join("\n") : "(nenhum)"}

TEXTO ESCRITO/COLADO AGORA PELO USUÁRIO (inclui o conteúdo de arquivos Word e de texto, já convertidos; pode ser a fonte mais importante, leia com atenção):
${textoExtra || "(nenhum)"}

CATEGORIAS DISPONÍVEIS NO SISTEMA (use SOMENTE um destes 11 códigos, exatamente como escrito):
${CATALOGO_CATEGORIAS}

REGRAS OBRIGATÓRIAS:
- NUNCA sugira preço, valor, custo ou qualquer número em R$ — nem estimativa. Isso é decidido depois, por uma pessoa. Uma resposta com preço será descartada inteira.
- "categoria_codigo": um dos 11 códigos acima (ex.: "003").
- Na categoria 011 (PÓS-PRODUÇÃO), "diaria" representa HORAS de trabalho, não dias.
- Nas demais categorias, "diaria" representa DIÁRIAS (dias de trabalho/uso).
- "quantity" é o número de pessoas ou unidades daquela linha (ex.: 2 câmeras, 3 diaristas).
- PESSOAS de set (direção, fotografia, câmera, produção de set, som, arte, maquiagem, assistentes) vão SEMPRE em 007 EQUIPE TÉCNICA; atores, modelos, figuração e locução em 006 ELENCO. 003 PRODUÇÃO é locação, estúdio, autorizações, estrutura e verbas — nunca gente.
- Uma linha por função/item específico — não agrupe "equipe técnica" genérico; detalhe (ex.: "Diretor", "Diretor de fotografia", "Operador de câmera", "Assistente de produção", "Motorista + van").
- "justificativa": uma frase curta (máx. 20 palavras) dizendo de onde veio essa necessidade no texto, ou avisando que é uma estimativa quando o texto não for explícito.
- Não invente informação que não esteja acima. Se algo relevante (nº de diárias, por exemplo) não foi dito, estime de forma conservadora e deixe isso claro na justificativa.
- Sugira entre 5 e 25 itens.

Responda APENAS com JSON válido, sem markdown, neste formato exato:
{"itens":[{"categoria_codigo":"003","descricao":"...","quantity":1,"diaria":1,"justificativa":"..."}]}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      // Arquivos antes da pergunta: a API responde melhor com o material
      // primeiro e a instrução no fim.
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: [
            ...anexos.map((a) => ({
              type: TIPOS_ANEXO[a.media_type],
              source: { type: "base64", media_type: a.media_type, data: a.base64 },
            })),
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const erro = await resp.text();
      console.error("Anthropic error:", resp.status, erro.slice(0, 500));
      if (resp.status === 401) return json({ error: "Chave de IA inválida." }, 502);
      // 400 da API costuma ser culpa do arquivo (PDF protegido, >100
      // páginas, imagem corrompida) — a mensagem dela diz qual, repassa.
      let detalhe = "";
      try { detalhe = JSON.parse(erro)?.error?.message || ""; } catch { /* texto cru */ }
      return json({
        error: resp.status === 400 && detalhe
          ? `A IA não conseguiu ler o material: ${detalhe}`
          : "A IA não respondeu agora. Tente de novo em instantes.",
      }, 502);
    }

    const data = await resp.json();
    const bruto = (data?.content?.[0]?.text || "").trim();
    const inicio = bruto.indexOf("{");
    const fim = bruto.lastIndexOf("}");
    let parsed: any;
    try {
      parsed = JSON.parse(bruto.slice(inicio, fim + 1));
    } catch {
      return json({ error: "IA respondeu num formato inesperado. Tente de novo." }, 502);
    }

    const { data: cats } = await supabase.from("budget_categorias").select("codigo");
    const codigosValidos = new Set((cats || []).map((c: any) => c.codigo));

    // Filtro de segurança: mesmo que a IA mande preço, esses campos não
    // existem no tipo de saída — só lemos os quatro que interessam.
    const itens = (Array.isArray(parsed?.itens) ? parsed.itens : [])
      .map((it: any) => {
        const codigo = String(it?.categoria_codigo || "").trim();
        const descricao = String(it?.descricao || "").trim();
        if (!descricao) return null;
        return {
          categoria_codigo: codigosValidos.has(codigo) ? codigo : null,
          descricao,
          quantity: Math.max(1, Math.round(Number(it?.quantity) || 1)),
          diaria: Math.max(0, Number(it?.diaria) || 1),
          justificativa: String(it?.justificativa || "").trim().slice(0, 240),
        };
      })
      .filter(Boolean)
      .slice(0, 25);

    if (!itens.length) return json({ error: "A IA não sugeriu nenhum item. Tente com mais detalhe no texto." }, 502);

    return json({ itens });
  } catch (e) {
    console.error("sugerir-itens-orcamento error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
