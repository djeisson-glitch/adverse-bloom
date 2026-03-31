import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api-v2.contaazul.com/v1";

async function getValidToken(supabase: any): Promise<{ token: string } | { error: string }> {
  const { data: authRow } = await supabase
    .from("conta_azul_cache")
    .select("payload, fetched_at")
    .eq("data_type", "auth_tokens")
    .single();

  if (!authRow) return { error: "Tokens não encontrados. Faça login na Conta Azul." };

  const payload = authRow.payload;
  const fetchedAt = new Date(authRow.fetched_at).getTime();
  const expiresIn = payload.expires_in || 3600;
  const expiresAt = fetchedAt + expiresIn * 1000;
  const now = Date.now();

  if (payload.access_token && now < expiresAt - 5 * 60 * 1000) {
    return { token: payload.access_token };
  }

  if (!payload.refresh_token) {
    return { error: "Sessão expirada — faça login novamente na Conta Azul." };
  }

  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!;
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const tokenRes = await fetch("https://auth.contaazul.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: payload.refresh_token,
    }).toString(),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return { error: "Sessão expirada — faça login novamente na Conta Azul." };
  }

  await supabase.from("conta_azul_cache").upsert(
    {
      data_type: "auth_tokens",
      payload: { ...payload, ...tokenData },
      fetched_at: new Date().toISOString(),
      period: "auth",
    },
    { onConflict: "data_type" },
  );

  return { token: tokenData.access_token };
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      cost_id,
      supplier_name,
      description,
      amount,
      payment_date,
      status,
      installments = 1,
      account_id,
    } = body;

    if (!cost_id || !amount || !supplier_name) {
      return new Response(
        JSON.stringify({ ok: false, error: "Campos obrigatórios: cost_id, amount, supplier_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tokenResult = await getValidToken(supabase);
    if ("error" in tokenResult) {
      return new Response(
        JSON.stringify({ ok: false, error: tokenResult.error }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const headers = {
      Authorization: `Bearer ${tokenResult.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const numInstallments = Math.max(1, Math.floor(installments));
    const installmentAmount = Math.round((amount / numInstallments) * 100) / 100;
    const createdIds: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < numInstallments; i++) {
      const dueDate = payment_date ? addMonths(payment_date, i) : new Date().toISOString().slice(0, 10);
      
      const caPayload: any = {
        descricao: numInstallments > 1
          ? `${description || supplier_name} (${i + 1}/${numInstallments})`
          : (description || supplier_name),
        total: installmentAmount,
        data_vencimento: dueDate,
        status: status === "paid" ? "ACQUITTED" : "PENDING",
        fornecedor: { nome: supplier_name },
      };

      if (account_id) {
        caPayload.conta_financeira = { id: account_id };
      }

      console.log(`[send-cost] Enviando parcela ${i + 1}/${numInstallments}:`, JSON.stringify(caPayload));

      const res = await fetch(`${BASE}/financeiro/eventos-financeiros/contas-a-pagar`, {
        method: "POST",
        headers,
        body: JSON.stringify(caPayload),
      });

      const resBody = await res.text();
      console.log(`[send-cost] Parcela ${i + 1} response: ${res.status} ${resBody}`);

      if (res.ok) {
        try {
          const parsed = JSON.parse(resBody);
          if (parsed.id) createdIds.push(parsed.id);
        } catch {}
      } else {
        errors.push(`Parcela ${i + 1}: HTTP ${res.status} — ${resBody}`);
      }
    }

    // Update project_cost with CA info
    if (createdIds.length > 0) {
      await supabase
        .from("project_costs")
        .update({
          sent_to_conta_azul: true,
          conta_azul_id: createdIds.join(","),
        })
        .eq("id", cost_id);
    }

    if (errors.length > 0 && createdIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: errors.join("; ") }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        created_ids: createdIds,
        partial_errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-cost] Erro:", String(e));
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
