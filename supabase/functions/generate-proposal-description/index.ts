import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectName, clientName, items, tags, deliverables } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const itemsSummary = (items || [])
      .filter((i: any) => i.client_price > 0)
      .map((i: any) => `- ${i.item_name} (${i.category}) — ${i.client_days || 0} diária(s)`)
      .join("\n");

    const deliverablesSummary = (deliverables || [])
      .filter((d: any) => d.name)
      .map((d: any) => `- ${d.name}`)
      .join("\n");

    // Pull capture days specifically from PRODUÇÃO category
    const producaoDays = (items || [])
      .filter((i: any) => (i.category || "").toUpperCase() === "PRODUÇÃO" && i.client_price > 0)
      .reduce((sum: number, i: any) => sum + (i.client_days || 0), 0);

    // Fallback: sum all days if no PRODUÇÃO category found
    const totalDays = producaoDays > 0
      ? producaoDays
      : (items || [])
          .filter((i: any) => i.client_price > 0)
          .reduce((sum: number, i: any) => sum + (i.client_days || 0), 0);

    const prompt = `Gere a descrição de projeto para esta proposta comercial.

Projeto: ${projectName}
Cliente: ${clientName}
Dias de captação: ${totalDays}
${tags?.length ? `Contexto: ${tags.join(", ")}` : ""}
${itemsSummary ? `Itens do escopo:\n${itemsSummary}` : ""}
${deliverablesSummary ? `Entregas para o cliente:\n${deliverablesSummary}` : ""}

REGRAS OBRIGATÓRIAS:
- Comece SEMPRE com "Este projeto contempla..."
- Cite o nome do projeto e o cliente
- Mencione os dias de captação quando houver
- Finalize com as entregas principais e onde serão distribuídas (se possível inferir)
- Máximo 2 frases
- Tom técnico e direto
- PROIBIDO usar: "alta qualidade", "garantir", "excelência", "impactante", "inovador", "estratégico", adjetivos vazios
- Sem aspas no texto final

Exemplo de referência:
"Este projeto contempla a cobertura audiovisual e fotográfica da Convenção Sicredi Sul Minas 2026, com captação em dois dias de evento. O material será produzido para distribuição no LinkedIn, com entrega de vídeo de depoimentos e galeria fotográfica tratada."`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Você escreve descrições técnicas de projeto para propostas comerciais de uma produtora audiovisual. Sempre inicie com 'Este projeto contempla...'. Seja direto, sem floreios, sem adjetivos vazios. Máximo 2 frases. Português brasileiro." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de AI esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const description = result.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
