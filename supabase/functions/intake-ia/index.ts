import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// intake-ia — leitura de complexidade de uma DEMANDA (interno).
//  Lê o briefing de cada entrega e devolve: complexidade por entrega,
//  complexidade geral, um fator de ajuste sobre a estimativa determinística
//  (duração + histórico) e riscos pro time. Grava em demandas.ia_complexidade.
//
//  Só time autenticado: valida o JWT do usuário (a anon key é recusada) pra
//  ninguém de fora queimar a chave da IA.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUR = (e: any) => (e?.duracao ? ` · ${e.duracao}` : "");
const FMT = (e: any) => (e?.formato ? ` · ${e.formato}` : "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const demandaId: string | undefined = body?.demanda_id;
    if (!demandaId) return json({ error: "demanda_id não informado." }, 400);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA não configurada (falta ANTHROPIC_API_KEY)." }, 503);
    const model = Deno.env.get("CLAUDE_MODEL") || "claude-3-5-sonnet-latest";

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Gate: precisa ser um usuário logado (não a anon key).
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: "Apenas o time interno pode analisar." }, 401);

    const { data: dem, error: derr } = await admin
      .from("demandas")
      .select("id, nome_projeto, entregas, viabilidade, client_id")
      .eq("id", demandaId)
      .maybeSingle();
    if (derr) return json({ error: "Erro ao ler a demanda." }, 500);
    if (!dem) return json({ error: "Demanda não encontrada." }, 404);

    let cliente = "cliente";
    if (dem.client_id) {
      const { data: cli } = await admin.from("clients").select("name").eq("id", dem.client_id).maybeSingle();
      if (cli?.name) cliente = cli.name;
    }

    const entregas = Array.isArray(dem.entregas) ? dem.entregas : [];
    const viab = (dem.viabilidade && typeof dem.viabilidade === "object" ? dem.viabilidade : {}) as Record<string, any>;

    const listaTxt = entregas.length
      ? entregas
          .map((e: any, i: number) => `${i + 1}. ${e?.titulo || `Vídeo ${i + 1}`}${FMT(e)}${DUR(e)}\n   Briefing: ${(e?.briefing || "(sem briefing)").toString().trim()}`)
          .join("\n")
      : "(sem entregas)";

    const contexto = [
      viab.total_horas != null ? `Estimativa determinística atual: ${viab.total_horas}h úteis (edição por duração + fila do editor + buffer de alteração).` : "",
      viab.rodadas != null
        ? `Rodadas de alteração projetadas: ${viab.rodadas}${viab.rodadas_hist ? " (baseado no histórico real do cliente)" : " (fator manual — pouco histórico ainda)"}.`
        : "",
    ].filter(Boolean).join("\n");

    const prompt = `Você é produtor(a) executivo(a) de uma produtora audiovisual avaliando a COMPLEXIDADE de uma demanda que chegou pelo formulário do cliente, pra o time calibrar o prazo. A estimativa por duração já existe; sua leitura é a camada humana (o que o briefing revela que a duração sozinha não pega).

Projeto: ${dem.nome_projeto || "novo projeto"}
Cliente: ${cliente}
${contexto}

ENTREGAS:
${listaTxt}

Avalie cada entrega e o conjunto. Considere sinais de complexidade no briefing: motion/animação, muitas versões/legendas, captação, roteiro, trilha original, aprovações difíceis, pressa. Se o briefing é raso, diga que a incerteza é alta (não invente complexidade que não está lá).

"fator_ajuste" é um multiplicador sobre a estimativa determinística: 1.0 = está calibrada; >1 = tende a dar mais trabalho do que a duração sugere; <1 = mais simples. Fique entre 0.7 e 2.5, e seja conservador quando o briefing for raso.

Retorne SOMENTE JSON válido, sem markdown:
{"entregas":[{"titulo":"...","complexidade":"baixa|média|alta","fator":1.0,"motivo":"curto"}],"complexidade_geral":"baixa|média|alta","fator_ajuste":1.0,"nota":"1-2 frases pro time","riscos":["...","..."]}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
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

    // Normaliza + trava o fator num intervalo são.
    const fator = Math.min(2.5, Math.max(0.7, Number(parsed.fator_ajuste) || 1));
    const resultado = {
      entregas: Array.isArray(parsed.entregas) ? parsed.entregas : [],
      complexidade_geral: (parsed.complexidade_geral || "média").toString(),
      fator_ajuste: Math.round(fator * 100) / 100,
      nota: (parsed.nota || "").toString(),
      riscos: Array.isArray(parsed.riscos) ? parsed.riscos.map(String) : [],
      horas_ajustadas: viab.total_horas != null ? Math.round(Number(viab.total_horas) * fator * 10) / 10 : null,
      gerado_em: new Date().toISOString(),
    };

    await admin.from("demandas").update({ ia_complexidade: resultado }).eq("id", demandaId);
    return json(resultado);
  } catch (e) {
    console.error("intake-ia error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
