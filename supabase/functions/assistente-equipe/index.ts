import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// Assistente da equipe — ajuda cada pessoa no dia a dia (tarefas, prazos,
// navegação no sistema). Ciente do que ESTÁ NA MESA DELA. Sem dados
// financeiros — vale pra qualquer papel, sem vazar dinheiro.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmtDia = (s?: string | null) => {
  if (!s) return "sem prazo";
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  return isNaN(d.getTime()) ? "sem prazo" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

    const { messages } = await req.json();

    // Quem está falando? (respeita o acesso: só vamos olhar as coisas dela)
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) throw new Error("Não autenticado");

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const nome = (profile?.full_name || "").split(" ")[0] || "você";

    // Contexto: SÓ o que é da pessoa. Nada de dinheiro.
    const [{ data: tarefas }, { data: entregaveis }] = await Promise.all([
      admin.from("tasks")
        .select("title, due_date, completed, projects(name)")
        .eq("assigned_user_id", user.id).eq("completed", false)
        .order("due_date", { ascending: true, nullsFirst: false }).limit(30),
      admin.from("deliverables")
        .select("titulo, status, prazo_interno, data_entrega, projects(name)")
        .eq("responsavel_id", user.id)
        .not("status", "in", "(aprovado,entregue,cancelado,arquivado)")
        .limit(30),
    ]);

    const linhasT = (tarefas || []).map((t: any) =>
      `- Tarefa: ${t.title}${t.projects?.name ? ` (${t.projects.name})` : ""} — vence ${fmtDia(t.due_date)}`);
    const linhasE = (entregaveis || []).map((d: any) =>
      `- Vídeo: ${d.titulo}${d.projects?.name ? ` (${d.projects.name})` : ""} — ${d.status || "pendente"}, prazo ${fmtDia(d.prazo_interno || d.data_entrega)}`);
    const contexto = [...linhasE, ...linhasT].join("\n") || "(nada em aberto no momento)";

    const system = `Você é o assistente do Adverse OS — a ferramenta interna da produtora Adverse. Ajuda ${nome} no dia a dia: o que fazer, prazos, e onde encontrar as coisas no sistema. Seja curto, prático e amigável, em português. Nunca invente dados. NUNCA fale de valores, faturamento, custo ou orçamento — você não tem esse dado e não é seu papel.

O QUE ${nome.toUpperCase()} TEM EM ABERTO AGORA:
${contexto}

COMO O SISTEMA SE ORGANIZA (pra orientar a navegação):
- "Minha mesa" (/minha-mesa): tudo que é dela — abas Editar (vídeos), Tarefas, Aprovar.
- "Projetos" (/projetos): os projetos e seus entregáveis.
- Dentro de um entregável: subir versão, mandar pra aprovação (N1/N2), ver "Alterações do cliente", e apontar horas no "Timesheet do entregável".
- Apontar horas: botão "Apontar" no topo — sempre preso a um entregável.
- O sino (topo) avisa prazos, ajustes pedidos e o resumo do dia.

Quando fizer sentido, diga em qual tela a pessoa resolve aquilo (ex.: "isso fica na sua Minha mesa, aba Aprovar"). Se ela perguntar de algo financeiro, diga gentilmente que isso é com a gestão.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-6",
        max_tokens: 1500,
        system,
        messages: (messages || []).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);
      return new Response(JSON.stringify({ error: `Erro da IA: ${response.status}` }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("assistente-equipe error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
