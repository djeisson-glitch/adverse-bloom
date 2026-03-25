import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, name, email } = await req.json();
    if (!token || !name || !email) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: token, name, email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get client IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    // Find proposal by token
    const { data: proposal, error: fetchErr } = await supabase
      .from("proposal_letters")
      .select("id, budget_id, status")
      .eq("token", token)
      .single();

    if (fetchErr || !proposal) {
      return new Response(JSON.stringify({ error: "Proposta não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (proposal.status === "approved") {
      return new Response(JSON.stringify({ error: "Proposta já aprovada", already_approved: true }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    // Update proposal letter
    const { error: updateErr } = await supabase
      .from("proposal_letters")
      .update({
        status: "approved",
        approved_name: name,
        approved_email: email,
        approved_ip: ip,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", proposal.id);
    if (updateErr) throw updateErr;

    // Update budget status
    const { error: budgetErr } = await supabase
      .from("budgets")
      .update({ status: "approved", updated_at: now })
      .eq("id", proposal.budget_id);
    if (budgetErr) console.error("Failed to update budget status:", budgetErr);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("approve-proposal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
