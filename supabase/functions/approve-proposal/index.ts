import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendEmailNotification(data: {
  contactCompany: string;
  projectName: string;
  approvedName: string;
  approvedEmail: string;
  budgetNumber: number | null;
  totalValue: number | null;
  approvedAt: string;
}) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping notification");
    return;
  }

  const totalFormatted = data.totalValue
    ? `R$ ${data.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "—";

  const dateFormatted = new Date(data.approvedAt).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const budgetRef = data.budgetNumber ? `#${data.budgetNumber}` : "—";

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #10b981; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">✅ Proposta Aprovada!</h1>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #6b7280; width: 140px;">Orçamento</td><td style="padding: 8px 0; font-weight: bold;">${budgetRef}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Projeto</td><td style="padding: 8px 0; font-weight: bold;">${data.projectName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Cliente</td><td style="padding: 8px 0; font-weight: bold;">${data.contactCompany}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Valor</td><td style="padding: 8px 0; font-weight: bold;">${totalFormatted}</td></tr>
          <tr><td colspan="2" style="padding: 12px 0 4px; border-top: 1px solid #e5e7eb;"></td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Aprovado por</td><td style="padding: 8px 0;">${data.approvedName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">E-mail</td><td style="padding: 8px 0;">${data.approvedEmail}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Data/Hora</td><td style="padding: 8px 0;">${dateFormatted}</td></tr>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Adverse <noreply@adverse.rec.br>",
        to: ["djeisson@adverse.rec.br"],
        subject: `✅ Proposta ${budgetRef} aprovada — ${data.contactCompany}`,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Email] Resend error [${res.status}]:`, body);
    } else {
      console.log("[Email] Approval notification sent successfully");
    }
  } catch (err) {
    console.error("[Email] Failed to send notification:", err);
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

    // Update budget status (this version)
    const { data: budget } = await supabase
      .from("budgets")
      .select("project_name, budget_number, total_value, parent_budget_id")
      .eq("id", proposal.budget_id)
      .single();

    const { error: budgetErr } = await supabase
      .from("budgets")
      .update({ status: "approved", updated_at: now })
      .eq("id", proposal.budget_id);
    if (budgetErr) console.error("Failed to update budget status:", budgetErr);

    // Note: we no longer update the parent budget status — the approved version
    // itself appears in the "Aprovados" listing with its own total_value.

    // Send email notification via Resend
    await sendEmailNotification({
      contactCompany: proposal.contact_company,
      projectName: budget?.project_name || "—",
      approvedName: name,
      approvedEmail: email,
      budgetNumber: budget?.budget_number ?? null,
      totalValue: budget?.total_value ?? null,
      approvedAt: now,
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
