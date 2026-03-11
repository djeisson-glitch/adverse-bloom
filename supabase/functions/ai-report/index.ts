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

    const custosFixosPct = financialData.receitaTotal > 0
      ? ((financialData.custosFixos / financialData.receitaTotal) * 100).toFixed(1)
      : "0.0";

    const prompt = `Você é um consultor financeiro. Gere um relatório executivo em HTML para uma empresa de produção audiovisual chamada Adverse, com base nos dados abaixo. O relatório deve ser profissional, direto e legível — sem tabelas complexas, sem jargão excessivo.

PERÍODO: ${financialData.periodoLabel}

DADOS:
- Receita (competência): R$ ${financialData.receitaTotal}
- Receita Recebida (caixa): R$ ${financialData.receitaRecebida}
- Despesas Operacionais: R$ ${financialData.despesasOperacionais}
- Custos Fixos: R$ ${financialData.custosFixos} (${custosFixosPct}% da receita)
- Custos Variáveis: R$ ${financialData.custosVariaveis}
- Lucro Líquido: R$ ${financialData.lucroLiquido}
- Margem Líquida: ${financialData.margemLiquida}%
- Margem de Contribuição: ${financialData.margemContribuicao}%
- Ticket Médio: R$ ${financialData.ticketMedio}
- Saldo em Conta: R$ ${financialData.saldoEmConta}
- Burn Rate: R$ ${financialData.burnRate}/mês
- Runway: ${financialData.runway} meses
- Concentração top 3 clientes: ${financialData.concentracaoReceita}%
- Meta Anual: R$ ${financialData.metaAnual}
- Receita acumulada no ano: R$ ${financialData.receitaAcumulada}

Retorne APENAS HTML válido (sem markdown, sem backticks) com esta estrutura:
- Cabeçalho: "Relatório Financeiro — Adverse" + período + data de geração
- Seção 1: Situação Atual (3-4 frases diretas sobre a saúde financeira)
- Seção 2: Principais Números (tabela simples com os KPIs acima)
- Seção 3: Pontos de Atenção (lista de até 4 alertas baseados nos dados)
- Seção 4: Oportunidades (lista de até 3 oportunidades identificadas)
- Seção 5: Recomendações (lista de até 4 ações prioritárias com prazo)
- Rodapé: "Gerado automaticamente pelo Dashboard Financeiro Adverse"

Use estilos inline. Fundo branco, fonte Arial, cores: títulos #1a1a1a, texto #333, destaque positivo #16a34a, destaque negativo #dc2626, tabela com bordas #e5e7eb. Página A4 com margens adequadas.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar relatório" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let html = data.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    html = html.trim();
    if (html.startsWith("```")) {
      html = html.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");
    }

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
