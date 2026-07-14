import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// digest-diario — "o que importa hoje", escrito pela IA, por pessoa.
//
//  Chamado pelo pg_cron às 8h05 (BRT), logo depois do job de prazos.
//  Em vez de despejar 12 notificações, a IA lê o estado REAL da pessoa (o que
//  vence, o que atrasou, o que pediram de alteração, o que espera o ok dela) e
//  escreve 2–3 linhas priorizadas. Uma notificação só, que vale a pena abrir.
//
//  Só roda pra quem tem alguma coisa. Quem está em dia não recebe nada —
//  notificação sem motivo é como o sistema perde a credibilidade.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const hojeBR = () =>
  new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA não configurada (falta ANTHROPIC_API_KEY)." }, 503);
    const model = Deno.env.get("CLAUDE_MODEL") || "claude-3-5-sonnet-latest";

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Quem está ativo no sistema
    const { data: pessoas } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("ativo", true);

    let gerados = 0;

    for (const p of (pessoas || []) as any[]) {
      // 1) o que caiu nas últimas 24h e ainda não foi lido
      const { data: notifs } = await admin
        .from("notificacoes")
        .select("tipo, prioridade, titulo, corpo")
        .eq("user_id", p.id)
        .is("lida_em", null)
        .neq("tipo", "digest")
        .gte("created_at", ontem)
        .order("created_at", { ascending: false })
        .limit(30);

      // 2) o que está na mão dela e vence/atrasou
      const { data: entregas } = await admin
        .from("deliverables")
        .select("titulo, status, prazo_interno, data_entrega, project:projects(name)")
        .eq("responsavel_id", p.id)
        .not("status", "in", "(aprovado,entregue,cancelado)");

      const { data: tarefas } = await admin
        .from("tasks")
        .select("title, due_date, project:projects(name)")
        .eq("assigned_user_id", p.id)
        .eq("completed", false)
        .not("due_date", "is", null);

      const prazoDe = (d: any) => d.prazo_interno || d.data_entrega;
      const entregasQuentes = (entregas || []).filter((d: any) => prazoDe(d) && prazoDe(d) <= hoje);
      const tarefasQuentes = (tarefas || []).filter((t: any) => t.due_date <= hoje);

      // Nada acontecendo? Não inventa notificação.
      if ((notifs?.length || 0) === 0 && entregasQuentes.length === 0 && tarefasQuentes.length === 0) {
        continue;
      }

      const contexto = [
        notifs?.length
          ? `AVISOS NÃO LIDOS (24h):\n${notifs.map((n: any) => `- [${n.prioridade}] ${n.titulo}${n.corpo ? `: ${n.corpo.replace(/\n/g, " ")}` : ""}`).join("\n")}`
          : "",
        entregasQuentes.length
          ? `VÍDEOS NA MÃO DELA VENCENDO/ATRASADOS:\n${entregasQuentes.map((d: any) => `- ${d.titulo} (${d.project?.name || "—"}) · prazo ${prazoDe(d)} · status ${d.status}`).join("\n")}`
          : "",
        tarefasQuentes.length
          ? `TAREFAS VENCENDO/ATRASADAS:\n${tarefasQuentes.map((t: any) => `- ${t.title} (${t.project?.name || "—"}) · prazo ${t.due_date}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n");

      const prompt = `Você é o assistente interno de uma produtora audiovisual. Escreva o resumo da manhã para ${p.full_name || "essa pessoa"}. Hoje é ${hoje}.

${contexto}

Escreva 2 a 3 frases curtas, em português, na segunda pessoa ("você"), dizendo O QUE IMPORTA HOJE — na ordem de urgência. Comece pelo que está atrasado ou vence hoje. Se o cliente pediu alteração, isso vem antes de tarefa nova. Seja direto e específico (cite o nome do vídeo/projeto), sem saudação, sem "bom dia", sem floreio, sem emoji. Se for pouca coisa, uma frase basta.

Responda SOMENTE com o texto do resumo, sem aspas e sem markdown.`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      });

      if (!resp.ok) {
        console.error("Anthropic error:", resp.status, (await resp.text()).slice(0, 200));
        continue;
      }
      const data = await resp.json();
      const texto = (data.content?.[0]?.text || "").trim();
      if (!texto) continue;

      // Uma por pessoa por dia (o dedupe_key no banco garante).
      await admin.from("notificacoes").insert({
        user_id: p.id,
        tipo: "digest",
        prioridade: "importante",
        titulo: `Seu dia · ${hojeBR()}`,
        corpo: texto,
        link: "/notificacoes",
        dedupe_key: `digest:${p.id}:${hoje}`,
      });
      gerados++;
    }

    return json({ ok: true, gerados });
  } catch (e) {
    console.error("digest-diario error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
