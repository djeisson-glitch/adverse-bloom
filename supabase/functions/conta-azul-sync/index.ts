import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CONTA_AZUL_BASE = "https://api.contaazul.com/v1";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getContaAzulToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID");
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("CONTA_AZUL_CLIENT_ID ou CONTA_AZUL_CLIENT_SECRET não configurados");
  }

  // Use Basic Auth header as per OAuth2 client_credentials spec
  const credentials = btoa(`${clientId}:${clientSecret}`);
  
  const res = await fetch("https://api.contaazul.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro ao obter token: ${res.status} - ${body}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function fetchContaAzul(token: string, path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${CONTA_AZUL_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro API Conta Azul ${path}: ${res.status} - ${body}`);
  }

  return res.json();
}

function getDateRange() {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    .toISOString()
    .split("T")[0];
  return { start, end };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = await getContaAzulToken();
    const { start, end } = getDateRange();
    const period = `${start}_${end}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all data sources in parallel
    const [receivables, payables, accounts, sales] = await Promise.all([
      fetchContaAzul(token, "/financial-transactions", {
        type: "RECEIVABLE",
        start_date: start,
        end_date: end,
      }),
      fetchContaAzul(token, "/financial-transactions", {
        type: "PAYABLE",
        start_date: start,
        end_date: end,
      }),
      fetchContaAzul(token, "/financial-accounts"),
      fetchContaAzul(token, "/sales", {
        start_date: start,
        end_date: end,
      }),
    ]);

    const now = new Date().toISOString();

    // Upsert cache entries (delete old, insert new)
    const dataTypes = [
      { data_type: "receivables", payload: receivables },
      { data_type: "payables", payload: payables },
      { data_type: "financial_accounts", payload: accounts },
      { data_type: "sales", payload: sales },
    ];

    // Clear old cache for these data types and period
    await supabase
      .from("conta_azul_cache")
      .delete()
      .in("data_type", dataTypes.map((d) => d.data_type));

    // Insert fresh data
    const { error: insertError } = await supabase
      .from("conta_azul_cache")
      .insert(
        dataTypes.map((d) => ({
          data_type: d.data_type,
          payload: d.payload,
          fetched_at: now,
          period,
        }))
      );

    if (insertError) {
      throw new Error(`Erro ao salvar cache: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: dataTypes.map((d) => d.data_type),
        period,
        fetched_at: now,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
