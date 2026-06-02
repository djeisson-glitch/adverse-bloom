import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Space "FINALIZADOS" do workspace da Adverse (cada lista = 1 projeto entregue).
const SPACE_FINALIZADOS = "901313834989";

async function fetchLists(spaceId: string, token: string, archived: boolean) {
  const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list?archived=${archived}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.lists ?? []) as Array<{ id: string; name: string; date_created?: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("CLICKUP_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "ClickUp não configurado (falta CLICKUP_API_TOKEN)." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lists = [
      ...(await fetchLists(SPACE_FINALIZADOS, token, false)),
      ...(await fetchLists(SPACE_FINALIZADOS, token, true)),
    ];

    // Cada lista é um projeto entregue. Data: do nome (#AAAAMMDD_...) ou date_created.
    const projetos = lists.map((l) => {
      const m = l.name.match(/#?(\d{4})(\d{2})(\d{2})/);
      const data = m
        ? `${m[1]}-${m[2]}-${m[3]}`
        : l.date_created
          ? new Date(Number(l.date_created)).toISOString().slice(0, 10)
          : null;
      return { id: l.id, nome: l.name, data };
    });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("clickup_cache").upsert(
      { data_type: "projetos_finalizados", payload: { itens: projetos }, fetched_at: new Date().toISOString() },
      { onConflict: "data_type" },
    );

    return new Response(JSON.stringify({ ok: true, total: projetos.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("clickup-sync error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
