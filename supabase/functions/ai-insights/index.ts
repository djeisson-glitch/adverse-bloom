import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmt = (n: number | undefined) =>
  (typeof n === "number" ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { financialData = {}, categorias = [] } = await req.json();

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "IA não configurada (falta ANTHROPIC_API_KEY)." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const model = Deno.env.get("CLAUDE_MODEL") || "claude-3-5-sonnet-latest";

    // Contexto da empresa (singleton) — alimenta recomendações sob medida.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ctx } = await admin.from("empresa_contexto").select("*").eq("id", 1).maybeSingle();

    const categoriasTxt = (categorias as Array<{ nome: string; valor: number; tipo?: string }>)
      .slice(0, 20)
      .map((c) => `  - ${c.nome}${c.tipo ? ` (${c.tipo})` : ""}: ${fmt(c.valor)}`)
      .join("\n") || "  (sem detalhamento de categorias)";

    const contextoTxt = ctx
      ? [
          ctx.meta_faturamento_mensal ? `- Meta de faturamento mensal: ${fmt(ctx.meta_faturamento_mensal)}` : "",
          ctx.meta_margem_liquida != null ? `- Meta de margem líquida: ${ctx.meta_margem_liquida}%` : "",
          ctx.headcount != null ? `- Headcount: ${ctx.headcount} pessoas` : "",
          ctx.estrutura ? `- Estrutura: ${ctx.estrutura}` : "",
          ctx.sazonalidade ? `- Sazonalidade: ${ctx.sazonalidade}` : "",
          ctx.prioridades ? `- Prioridades atuais: ${ctx.prioridades}` : "",
          ctx.observacoes ? `- Observações: ${ctx.observacoes}` : "",
        ].filter(Boolean).join("\n")
      : "";

    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const prompt = `Você é o CFO de uma produtora audiovisual. Analise os números REAIS abaixo e produza recomendações ESPECÍFICAS, citando categorias e valores concretos — nada de conselhos genéricos.

HOJE É ${hoje}. NÃO invente datas, meses nem anos, e NÃO assuma que o período/ano já terminou — use somente os números fornecidos.
PERÍODO ANALISADO: ${financialData.periodo ?? financialData.mesAtual ?? "atual"}

INDICADORES:
- Faturamento: ${fmt(financialData.receitaTotal)}
- Custos fixos: ${fmt(financialData.custosFixos)}
- Custos variáveis: ${fmt(financialData.custosVariaveis)}
- Impostos sobre venda: ${fmt(financialData.impostosVenda)}
- Custos do projeto (diretos): ${fmt(financialData.custosProjeto)}
- Margem bruta: ${fmt(financialData.margemBrutaValor)} (${financialData.margemBruta ?? 0}%)
- Margem de contribuição: ${financialData.margemContribuicao ?? 0}%
- Margem líquida: ${financialData.margemLiquida ?? 0}%
- Ticket médio: ${fmt(financialData.ticketMedio)}
- Saldo em conta: ${fmt(financialData.saldoEmConta)} | Runway: ${financialData.runway ?? "?"} meses

PRINCIPAIS CATEGORIAS DE CUSTO NO PERÍODO:
${categoriasTxt}

${contextoTxt ? `CONTEXTO DA EMPRESA:\n${contextoTxt}\n` : ""}
INSTRUÇÕES:
- Aponte ONDE cortar/otimizar citando a CATEGORIA e um valor estimado de economia em R$.
- Compare margens com a meta (se houver) e diga o gap.
- Cada ação deve ser concreta e executável ("renegociar X", "cortar Y", "subir ticket de Z para W").
- Seja direto e quantitativo.
- Os campos "impacto" e "potencial" devem ser MUITO CURTOS (só o número, ex.: "R$ 145 mil" ou "+8%"). Toda a explicação vai em "descricao".
- Não invente datas. Não escreva frases como "encerrou o ano" ou meses específicos que não estão nos dados.

Retorne APENAS JSON válido (sem markdown):
{
  "resumo": "2 linhas diretas sobre a saúde financeira do período",
  "alertas": [{"titulo": "string", "descricao": "string citando categoria/valor", "severidade": "alta|media|baixa", "impacto": "R$ ou %"}],
  "oportunidades": [{"titulo": "string", "descricao": "string", "potencial": "R$ ou % estimado"}],
  "acoes": [{"acao": "ação concreta citando categoria/valor", "prazo": "imediato|30 dias|90 dias", "impacto": "alto|medio|baixo"}]
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);
      const msg = response.status === 401 ? "Chave de IA inválida." : "Erro ao consultar a IA.";
      return new Response(JSON.stringify({ error: msg, detail: t.slice(0, 300) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let text = (data.content?.[0]?.text || "").replace(/```(?:json)?/g, "").trim();
    // Extrai o bloco JSON, ignorando qualquer preâmbulo do modelo.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: "Resposta da IA fora do formato.", raw: text.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
