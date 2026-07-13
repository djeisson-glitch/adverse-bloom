import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// mergulho-ia — IA do Briefing/Mergulho (Método Adverse)
//  Segura no servidor: usa o secret ANTHROPIC_API_KEY (o MESMO que a IA
//  financeira já usa), o cliente/browser nunca vê a chave.
//
//  Gate por token: sempre valida o mergulho_token do deal antes de gastar IA
//  — vale tanto pro time (editor tem/gera o token) quanto pro cliente
//  (o token vem da URL do briefing). Assim ninguém anônimo abusa da chave.
//
//  acao:
//   • "consolidar"  → INTERNO. Consolidação do projeto + pontos de atenção +
//                     perguntas que o time ainda precisa esclarecer.
//   • "followups"   → CLIENTE (automático). 2–3 perguntas curtas e gentis,
//                     no tom do cliente, pra fechar as lacunas do briefing.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rótulos das perguntas do cliente (espelha src/lib/mergulho.ts) — só pra
// deixar o dump legível pro modelo.
const LABELS: Record<string, string> = {
  marca: "Sobre a marca / empresa",
  objetivo: "Objetivo do projeto",
  publico: "Quem querem impactar (público)",
  mensagem: "Mensagem-chave",
  entregas: "Entregas",
  tom: "Tom e referências",
  veiculacao: "Onde vai ser veiculado",
  nao_pode_faltar: "O que não pode faltar / evitar",
  materiais: "Materiais que já têm",
  verba_prazo: "Verba e prazo (aproximados)",
};
const ORDEM = Object.keys(LABELS);

function dumpRespostas(m: Record<string, any>): string {
  const linhas: string[] = [];
  for (const key of ORDEM) {
    const v = m?.[key];
    if (key === "entregas") {
      const arr = Array.isArray(v) ? v : [];
      if (arr.length) {
        const itens = arr
          .map((e: any) => `${e?.titulo || "peça"}${e?.formato ? ` · ${e.formato}` : ""}${e?.duracao ? ` · ${e.duracao}` : ""}`)
          .join("; ");
        linhas.push(`- ${LABELS[key]}: ${itens}`);
      } else {
        linhas.push(`- ${LABELS[key]}: (não respondeu)`);
      }
    } else {
      const t = (v ?? "").toString().trim();
      linhas.push(`- ${LABELS[key]}: ${t || "(não respondeu)"}`);
    }
  }
  // Perguntas extras que a própria IA sugeriu e o cliente respondeu.
  const extras = Array.isArray(m?.ia_extras) ? m.ia_extras : [];
  for (const ex of extras) {
    const r = (ex?.resposta ?? "").toString().trim();
    if (ex?.pergunta && r) linhas.push(`- ${ex.pergunta}: ${r}`);
  }
  return linhas.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body?.token;
    const acao: string = body?.acao === "consolidar" ? "consolidar" : "followups";

    if (!token) {
      return json({ error: "Token do briefing não informado." }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "IA não configurada (falta ANTHROPIC_API_KEY)." }, 503);
    }
    const model = Deno.env.get("CLAUDE_MODEL") || "claude-3-5-sonnet-latest";

    // Valida o token e lê o mergulho salvo (service role — ignora RLS).
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: deal, error: derr } = await admin
      .from("deals")
      .select("id, title, mergulho, client_id")
      .eq("mergulho_token", token)
      .maybeSingle();

    if (derr) {
      console.error("mergulho-ia db error:", derr);
      return json({ error: "Erro ao ler o briefing." }, 500);
    }
    if (!deal) {
      return json({ error: "Briefing não encontrado." }, 404);
    }

    // Nome do cliente é só contexto pro prompt — se falhar, segue sem ele.
    let cliente = "cliente";
    if (deal.client_id) {
      const { data: cli } = await admin.from("clients").select("name").eq("id", deal.client_id).maybeSingle();
      if (cli?.name) cliente = cli.name;
    }

    const mergulho = (deal.mergulho && typeof deal.mergulho === "object" ? deal.mergulho : {}) as Record<string, any>;
    const projeto = deal.title || "novo projeto";
    const respostas = dumpRespostas(mergulho);

    const prompt =
      acao === "consolidar"
        ? `Você é estrategista de uma produtora audiovisual (Método Adverse). Leia o briefing que o cliente preencheu e faça uma leitura para o TIME INTERNO.

Projeto: ${projeto}
Cliente: ${cliente}

RESPOSTAS DO CLIENTE:
${respostas}

Tarefa:
1) "consolidacao": um parágrafo (3–5 frases) consolidando o entendimento do projeto — o que é, pra quem, o que precisa acontecer e o tom. Escreva em português, direto, sem floreio, sem adjetivo vazio. É uma nota interna do time, não um texto pro cliente.
2) "pontos_atencao": 2 a 4 pontos de atenção/risco pra produção (prazos apertados, escopo dúbio, expectativa x verba, material que falta…). Curtos.
3) "perguntas": 2 a 4 perguntas que o time ainda precisa esclarecer com o cliente antes de orçar. Curtas e objetivas.

Retorne SOMENTE JSON válido, sem markdown:
{"consolidacao":"...","pontos_atencao":["...","..."],"perguntas":["...","..."]}`
        : `Você é o assistente de briefing de uma produtora audiovisual, falando DIRETO COM O CLIENTE de forma calorosa e simples. O cliente preencheu o briefing abaixo e está prestes a enviar.

Projeto: ${projeto}

RESPOSTAS DO CLIENTE:
${respostas}

Tarefa: sugira de 2 a 3 perguntas de complemento que ajudariam mais a entender o projeto — foque nas LACUNAS mais importantes (o que ficou vago ou faltou). NÃO faça perguntas conceituais profundas (zeitgeist, tensão, etc. são internas nossas). Fale na segunda pessoa ("você"), tom leve e acolhedor, uma frase por pergunta. Se o briefing já estiver bem completo, pode devolver menos perguntas (ou nenhuma).

Retorne SOMENTE JSON válido, sem markdown:
{"perguntas":["...","..."]}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);
      const msg = response.status === 401 ? "Chave de IA inválida." : "Erro ao consultar a IA.";
      return json({ error: msg, detail: t.slice(0, 300) }, 502);
    }

    const data = await response.json();
    let text = (data.content?.[0]?.text || "").replace(/```(?:json)?/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "Resposta da IA fora do formato.", raw: text.slice(0, 400) }, 502);
    }

    // Normaliza os campos esperados.
    if (acao === "consolidar") {
      return json({
        consolidacao: (parsed.consolidacao || "").toString(),
        pontos_atencao: Array.isArray(parsed.pontos_atencao) ? parsed.pontos_atencao.map(String) : [],
        perguntas: Array.isArray(parsed.perguntas) ? parsed.perguntas.map(String) : [],
      });
    }
    return json({
      perguntas: Array.isArray(parsed.perguntas) ? parsed.perguntas.map(String).slice(0, 3) : [],
    });
  } catch (e) {
    console.error("mergulho-ia error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
