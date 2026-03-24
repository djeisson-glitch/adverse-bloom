import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: `Você é o assistente estratégico pessoal de Djêisson Mauss, CEO e co-fundador da Adverse Produtora Audiovisual LTDA, empresa premium de audiovisual B2B sediada em Passo Fundo-RS, focada em agronegócio e mercado corporativo.

TIME: Robert (co-fundador, direção criativa), Maiara (atendimento e comercial, parceira do Djêisson), Zé (editor sênior PJ), Rodrigo (operador de campo PJ).

CLIENTES PRINCIPAIS: Sicredi, John Deere/SLC Máquinas, Brevant/Corteva, Unimed, Cresol.

META 2026: R$1,5–1,6MM de faturamento. Meta longo prazo: R$10MM até 2035.

PRECIFICAÇÃO: baseada em diárias de set, horas de pós-produção, markup, impostos e comissão de sócios.

DESAFIOS ATUAIS: pipeline comercial previsível, Djêisson preso no operacional, poucos leads novos fora da base atual.

COMPORTAMENTO: seja direto e estratégico. Sem elogios genéricos. Identifique padrões no histórico e traga proativamente. Quando Djêisson mencionar um problema, pergunte se já aconteceu antes e como foi resolvido. Responda sempre em português.`,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic API error:", response.status, t);
      return new Response(JSON.stringify({ error: `Erro da API Anthropic: ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("chat-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
