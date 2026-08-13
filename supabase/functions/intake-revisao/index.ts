import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// intake-revisao — a IA lendo o briefing ENQUANTO o cliente ainda está no
//  formulário. Devolve o que ficou faltando, em forma de pergunta, pro
//  pop-up de conferência.
//
//  É a camada que a checagem de campo vazio não pega: "objetivo: um vídeo
//  bonito" está preenchido e não diz nada. O que falta aqui volta depois como
//  alteração — e alteração fora do briefing vira custo.
//
//  PÚBLICA (verify_jwt = false): quem abre o formulário não tem login. O
//  portão é o slug — precisa ser de um cliente com intake ativo, o mesmo
//  portão do intake_submit. Payload é truncado antes de virar prompt pra
//  ninguém usar o endpoint como chatbot de graça.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ENTREGAS = 12;
const MAX_BRIEFING = 1500;

const corta = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const slug = corta(body?.slug, 120);
    if (!slug) return json({ error: "slug não informado." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Portão: só slug de cliente com formulário ativo.
    const { data: cli } = await admin
      .from("clients")
      .select("id, name, intake_ativo")
      .eq("intake_slug", slug)
      .maybeSingle();
    if (!cli?.intake_ativo) return json({ error: "Formulário não encontrado." }, 404);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    // Sem chave a conferência local do formulário continua valendo — por isso
    // devolvemos 200 com lista vazia em vez de erro (não é falha pro cliente).
    if (!apiKey) return json({ faltas: [], resumo: "" });

    const entregas = (Array.isArray(body?.entregas) ? body.entregas : [])
      .slice(0, MAX_ENTREGAS)
      .map((e: any, i: number) => ({
        titulo: corta(e?.titulo, 120) || `Vídeo ${i + 1}`,
        formato: corta(e?.formato, 20),
        duracao: corta(e?.duracao, 40),
        briefing: corta(e?.briefing, MAX_BRIEFING),
      }));
    if (!entregas.length) return json({ faltas: [], resumo: "" });

    const lista = entregas
      .map((e, i) =>
        `${i + 1}. ${e.titulo}${e.formato ? ` · ${e.formato}` : ""}${e.duracao ? ` · ${e.duracao}` : " · (duração não informada)"}\n` +
        `   ${e.briefing || "(briefing em branco)"}`,
      )
      .join("\n\n");

    const prompt = `Você é produtor(a) executivo(a) de uma produtora audiovisual conferindo um briefing que um cliente está prestes a enviar pelo formulário. Seu trabalho é apontar o que falta AGORA, enquanto ele ainda pode completar — porque informação que falta vira alteração depois, e alteração fora do briefing vira custo pro cliente.

Cliente: ${corta(cli.name, 120) || "cliente"}
Projeto: ${corta(body?.projeto, 160) || "(sem nome)"}

ENTREGAS:
${lista}

O formulário já obriga título, formato, duração, GC (com nome e cargo) e lettering — não gaste item da lista com isso, já veio conferido. Descrição, referências e "o que não pode faltar" são opcionais no formulário: é aí que mora o que costuma virar alteração depois.

Aponte só lacunas REAIS que atrapalhariam a produção: informação ausente, ou presente mas vaga demais pra executar ("um vídeo bonito" não é descrição; "referências: várias" não é referência). Se o briefing está bom, devolva a lista vazia — não invente problema pra parecer útil.

Regras da resposta:
- No máximo 5 lacunas, as mais caras primeiro.
- "entrega" = só o título da entrega, exatamente como está acima, sem o formato nem a duração junto.
- "campo" = 1 a 3 palavras (ex.: "Objetivo", "Duração", "GC", "Referências").
- "pergunta" = UMA pergunta curta e direta pro cliente, na segunda pessoa, que resolveria a lacuna. Sem jargão de produtora.
- "resumo" = no máximo uma frase, tom leve, falando com o cliente. Se não houver lacuna, elogie brevemente e diga que pode enviar.

QUANTAS PEÇAS SÃO — leia isto com cuidado, é o erro mais caro deste formulário.

Uma PEÇA é um vídeo entregue e exportado separadamente. NÃO são peças
separadas: cenas, blocos, capítulos, locuções, planos, GCs, letterings ou
versões do mesmo vídeo. Um roteiro com "Cena 1, Cena 2, Cena 3, Cena 4" é UM
vídeo com quatro cenas — não quatro vídeos.

São peças separadas quando o briefing pede formatos diferentes do mesmo
conteúdo (16x9 e 9x16), cortes de durações diferentes (versão de 30s e de
60s), ou assuntos que não caberiam no mesmo vídeo.

- "pecas_no_briefing" = quantos vídeos FINAIS o texto descreve. Na dúvida,
  responda o mesmo número de entregas cadastradas — não invente divergência.
- "pecas_observacao" = só se o número divergir do que foi cadastrado: uma
  frase dizendo o que no texto sugere outro número. Vazio se bate.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("CLAUDE_MODEL") || "claude-opus-4-8",
        max_tokens: 1500,
        // O cliente está parado olhando o pop-up: esforço baixo mantém rápido,
        // e o formato estruturado garante JSON válido (nada de parsear ```json).
        thinking: { type: "adaptive" },
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                resumo: { type: "string" },
                pecas_no_briefing: { type: "integer" },
                pecas_observacao: { type: "string" },
                faltas: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      entrega: { type: "string" },
                      campo: { type: "string" },
                      pergunta: { type: "string" },
                    },
                    required: ["entrega", "campo", "pergunta"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["resumo", "faltas", "pecas_no_briefing", "pecas_observacao"],
              additionalProperties: false,
            },
          },
        },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.error("Anthropic error:", resp.status, (await resp.text()).slice(0, 300));
      return json({ faltas: [], resumo: "" }); // falha da IA não pode travar o envio
    }

    const data = await resp.json();
    if (data?.stop_reason === "refusal") return json({ faltas: [], resumo: "" });

    const texto = (data?.content || []).find((b: any) => b?.type === "text")?.text || "";
    let parsed: any;
    try {
      parsed = JSON.parse(texto);
    } catch {
      console.error("intake-revisao: resposta fora do formato:", texto.slice(0, 300));
      return json({ faltas: [], resumo: "" });
    }

    // O nome da entrega tem que voltar IGUAL ao do formulário: é por ele que o
    // pop-up junta esta lista com a checagem local. Se a IA devolver
    // "Depoimento · 16x9" ou variar, a mesma lacuna apareceria duas vezes.
    const titulos = entregas.map((e) => e.titulo);
    const casar = (v: string) =>
      titulos.find((t) => t === v) ||
      titulos.find((t) => v.includes(t)) ||
      (titulos.length === 1 ? titulos[0] : v);

    const faltas = (Array.isArray(parsed?.faltas) ? parsed.faltas : [])
      .slice(0, 5)
      .map((f: any) => ({
        entrega: casar(corta(f?.entrega, 80)),
        campo: corta(f?.campo, 40),
        pergunta: corta(f?.pergunta, 240),
      }))
      .filter((f: any) => f.pergunta);

    // Quantas peças a IA leu no texto × quantas o cliente cadastrou.
    //
    // O caso que originou isto: um briefing com "Cena 1..4" veio como 1
    // entrega, a Adverse entendeu 3 peças e no fim era 1 só. Divergência aqui
    // não bloqueia nada — vira uma pergunta no pop-up, que é onde o cliente
    // ainda pode responder.
    const noBriefing = Number.isFinite(parsed?.pecas_no_briefing)
      ? Math.max(0, Math.min(20, Math.round(parsed.pecas_no_briefing)))
      : entregas.length;

    return json({
      faltas,
      resumo: corta(parsed?.resumo, 240),
      pecas: {
        cadastradas: entregas.length,
        no_briefing: noBriefing,
        divergente: noBriefing > 0 && noBriefing !== entregas.length,
        observacao: corta(parsed?.pecas_observacao, 240),
      },
    });
  } catch (e) {
    console.error("intake-revisao error:", e);
    return json({ faltas: [], resumo: "" });
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
