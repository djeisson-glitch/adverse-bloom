import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// digest-diario — "o que importa hoje", escrito pela IA, por pessoa.
//
//  Chamado pelo pg_cron às 8h05 (BRT), logo depois do job de prazos.
//  Em vez de despejar 12 notificações, a IA lê o estado REAL da pessoa (o que
//  vence, o que atrasou, o que pediram de alteração, o que espera o ok dela) e
//  escreve no máximo 2 frases priorizadas. Curto de propósito: a tela já\n//  lista cada item logo abaixo — o resumo diz o que priorizar, não repete.
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

// Gera (e grava) o resumo de UMA pessoa. Retorna o texto, ou null se não havia
// nada pra dizer. Com `forcar`, sobrescreve o digest do dia (botão "gerar agora");
// sem, respeita o dedupe (uma vez por dia, no cron).
async function gerarPara(
  admin: any, apiKey: string, model: string, p: any, hoje: string, ontem: string, forcar: boolean,
): Promise<string | null> {
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
    return null;
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

Escreva NO MÁXIMO 2 frases, em português, na segunda pessoa ("você"), dizendo O QUE IMPORTA HOJE — na ordem de urgência. Comece pelo que está atrasado ou vence hoje. Se o cliente pediu alteração, isso vem antes de tarefa nova.\n\nSEJA CURTO: o resumo fica no topo de uma tela que JÁ LISTA cada item logo abaixo, com botão de ação. Repetir a lista em prosa é desperdício de espaço — o seu papel é dizer o que priorizar, não descrever tudo. Cite o nome da peça só quando for essencial pra identificar. Uma frase é o ideal; duas é o teto. Sem saudação, sem "bom dia", sem floreio, sem emoji, sem repetir prazos que já aparecem na lista.

Responda SOMENTE com o texto do resumo, sem aspas e sem markdown.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
  });

  if (!resp.ok) {
    console.error("Anthropic error:", resp.status, (await resp.text()).slice(0, 200));
    return null;
  }
  const data = await resp.json();
  const texto = (data.content?.[0]?.text || "").trim();
  if (!texto) return null;

  const linha = {
    user_id: p.id,
    tipo: "digest",
    prioridade: "importante",
    titulo: `Seu dia · ${hojeBR()}`,
    corpo: texto,
    link: "/",
    dedupe_key: `digest:${p.id}:${hoje}`,
  };

  if (forcar) {
    // "Gerar agora": apaga o digest do dia (se houver) e regrava não lido.
    // Delete+insert evita a inferência de ON CONFLICT sobre o índice parcial.
    await admin.from("notificacoes").delete().eq("user_id", p.id).eq("dedupe_key", linha.dedupe_key);
  }
  // Cron: uma por pessoa por dia (o índice único no dedupe_key garante).
  await admin.from("notificacoes").insert(linha);
  return texto;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA não configurada (falta ANTHROPIC_API_KEY)." }, 503);
    const model = Deno.env.get("CLAUDE_MODEL") || "claude-opus-4-8";

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const body = await req.json().catch(() => ({}));
    const soUmId = (body?.user_id || "").toString().trim();

    // Modo "gerar agora" (uma pessoa, sob demanda pelo card "Seu dia").
    if (soUmId) {
      const { data: pessoa } = await admin.from("profiles").select("id, full_name").eq("id", soUmId).maybeSingle();
      if (!pessoa) return json({ error: "Pessoa não encontrada." }, 404);
      const texto = await gerarPara(admin, apiKey, model, pessoa, hoje, ontem, true);
      return json({ ok: true, texto });
    }

    // Modo cron: todo mundo ativo, uma vez por dia.
    const { data: pessoas } = await admin.from("profiles").select("id, full_name").eq("ativo", true);
    let gerados = 0;
    for (const p of (pessoas || []) as any[]) {
      const texto = await gerarPara(admin, apiKey, model, p, hoje, ontem, false);
      if (texto) gerados++;
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
