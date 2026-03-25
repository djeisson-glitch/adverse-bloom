import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch proposal with budget + items
    const { data: proposal, error } = await supabase
      .from("proposal_letters")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !proposal) {
      return new Response(JSON.stringify({ error: "Proposta não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record first view timestamp
    if (!proposal.viewed_at && proposal.status === "pending") {
      await supabase
        .from("proposal_letters")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", proposal.id);
      proposal.viewed_at = new Date().toISOString();
    }

    // Fetch budget
    const { data: budget } = await supabase
      .from("budgets")
      .select("*")
      .eq("id", proposal.budget_id)
      .single();

    // Fetch budget items
    const { data: items } = await supabase
      .from("budget_items")
      .select("*")
      .eq("budget_id", proposal.budget_id)
      .order("order_index", { ascending: true });

    return new Response(JSON.stringify({
      proposal,
      budget,
      items: items || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-proposal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
