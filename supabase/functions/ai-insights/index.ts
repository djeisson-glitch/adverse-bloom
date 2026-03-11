import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { financialData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `Você é um consultor financeiro especializado em empresas de produção audiovisual. Analise os dados financeiros abaixo e retorne um JSON com insights práticos e diretos.

DADOS DO PERÍODO SELECIONADO:
- Receita Total: R$ ${financialData.receitaTotal}
- Despesas Operacionais: R$ ${financialData.despesasOperacionais}
- Lucro Líquido: R$ ${financialData.lucroLiquido}
- Margem Líquida: ${financialData.margemLiquida}%
- Margem de Contribuição: ${financialData.margemContribuicao}%
- Custos Fixos: R$ ${financialData.custosFixos}
- Custos Variáveis: R$ ${financialData.custosVariaveis}
- Ticket Médio: R$ ${financialData.ticketMedio}
- Saldo em Conta: R$ ${financialData.saldoEmConta}
- Burn Rate Mensal: R$ ${financialData.burnRate}
- Runway: ${financialData.runway} meses
- Top 3 clientes representam: ${financialData.concentracaoReceita}% da receita
- Meta Anual: R$ ${financialData.metaAnual}
- Receita acumulada no ano: R$ ${financialData.receitaAcumulada}
- Mês atual: ${financialData.mesAtual}

Retorne APENAS um JSON válido, sem markdown, neste formato exato:
{
  "resumo": "frase direta de 2 linhas sobre a situação financeira atual",
  "alertas": [
    {"titulo": "string", "descricao": "string", "severidade": "alta|media|baixa", "impacto": "string com valor em R$ ou %"}
  ],
  "oportunidades": [
    {"titulo": "string", "descricao": "string", "potencial": "string com valor ou % estimado"}
  ],
  "acoes": [
    {"acao": "string curta e direta", "prazo": "imediato|30 dias|90 dias", "impacto": "alto|medio|baixo"}
  ]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao consultar IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    // Try to parse JSON from response, handling potential markdown wrapping
    let cleanText = text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    
    const insights = JSON.parse(cleanText);

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
