import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendWhatsAppNotification(proposalData: {
  contactName: string;
  contactCompany: string;
  projectName: string;
  approvedName: string;
  approvedEmail: string;
  budgetNumber: number | null;
  totalValue: number | null;
}) {
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
    console.warn("[WhatsApp] Evolution API not configured, skipping notification");
    return;
  }

  const notifyNumber = "5554996378692";

  const totalFormatted = proposalData.totalValue
    ? `R$ ${proposalData.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`
    : "—";

  const message = [
    `✅ *Proposta aprovada!*`,
    ``,
    `📋 *Projeto:* ${proposalData.projectName}`,
    proposalData.budgetNumber ? `🔢 *Orçamento:* #${proposalData.budgetNumber}` : null,
    `🏢 *Cliente:* ${proposalData.contactCompany}`,
    `💰 *Valor:* ${totalFormatted}`,
    ``,
    `👤 *Aprovado por:* ${proposalData.approvedName}`,
    `📧 *E-mail:* ${proposalData.approvedEmail}`,
  ].filter(Boolean).join("\n");

  try {
    const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: notifyNumber,
        text: message,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[WhatsApp] Evolution API error [${res.status}]:`, body);
    } else {
      console.log("[WhatsApp] Notification sent successfully");
    }
  } catch (err) {
    console.error("[WhatsApp] Failed to send notification:", err);
  }
}

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

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    // Find proposal by token
    const { data: proposal, error: fetchErr } = await supabase
      .from("proposal_letters")
      .select("id, budget_id, status, contact_name, contact_company")
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
    const { data: budget } = await supabase
      .from("budgets")
      .select("project_name, budget_number, total_value")
      .eq("id", proposal.budget_id)
      .single();

    const { error: budgetErr } = await supabase
      .from("budgets")
      .update({ status: "approved", updated_at: now })
      .eq("id", proposal.budget_id);
    if (budgetErr) console.error("Failed to update budget status:", budgetErr);

    // Send WhatsApp notification (fire-and-forget)
    await sendWhatsAppNotification({
      contactName: proposal.contact_name,
      contactCompany: proposal.contact_company,
      projectName: budget?.project_name || "—",
      approvedName: name,
      approvedEmail: email,
      budgetNumber: budget?.budget_number ?? null,
      totalValue: budget?.total_value ?? null,
    });

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
