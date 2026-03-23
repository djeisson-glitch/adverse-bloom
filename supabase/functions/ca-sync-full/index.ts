import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(supabase: any): Promise<{ token: string } | { error: string; reauth: boolean }> {
  const { data: authRow } = await supabase
    .from("conta_azul_cache")
    .select("payload, fetched_at")
    .eq("data_type", "auth_tokens")
    .single();

  if (!authRow) return { error: "Tokens não encontrados. Faça login na Conta Azul.", reauth: true };

  const payload = authRow.payload;
  const fetchedAt = new Date(authRow.fetched_at).getTime();
  const expiresIn = payload.expires_in || 3600;
  const expiresAt = fetchedAt + expiresIn * 1000;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (payload.access_token && now < expiresAt - fiveMinutes) {
    return { token: payload.access_token };
  }

  if (!payload.refresh_token) {
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

  return await refreshToken(supabase, payload);
}

async function refreshToken(supabase: any, payload: any): Promise<{ token: string } | { error: string; reauth: boolean }> {
  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!;

  const tokenRes = await fetch("https://api.contaazul.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: payload.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error("Token refresh failed:", JSON.stringify(tokenData));
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
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

const BASE = "https://api-v2.contaazul.com";
const dataInicio = "2024-01-01";
const dataFim = "2026-12-31";

type SyncResult = { status: "ok"; total?: number } | { status: "error"; message: string } | { status: "reauth" };

async function fetchWithRetry(
  supabase: any,
  bearerRef: { token: string },
  fn: (headers: Record<string, string>) => Promise<SyncResult>,
): Promise<SyncResult> {
  const headers = { Authorization: `Bearer ${bearerRef.token}`, Accept: "application/json" };
  const result = await fn(headers);

  if (result.status === "error" && result.message.includes("invalid_token")) {
    // Try refreshing token
    const { data: authRow } = await supabase
      .from("conta_azul_cache")
      .select("payload")
      .eq("data_type", "auth_tokens")
      .single();

    if (!authRow?.payload?.refresh_token) return { status: "reauth" };

    const refreshResult = await refreshToken(supabase, authRow.payload);
    if ("error" in refreshResult) return { status: "reauth" };

    bearerRef.token = refreshResult.token;
    const retryHeaders = { Authorization: `Bearer ${bearerRef.token}`, Accept: "application/json" };
    return await fn(retryHeaders);
  }

  return result;
}

async function syncSimple(
  supabase: any,
  url: string,
  dataType: string,
  headers: Record<string, string>,
  now: string,
  period: string,
): Promise<SyncResult> {
  const res = await fetch(url, { headers });
  if (res.status === 401) {
    const body = await res.text();
    return { status: "error", message: "invalid_token: " + body };
  }
  if (!res.ok) {
    return { status: "error", message: `HTTP ${res.status}` };
  }
  const payload = await res.json();
  await supabase.from("conta_azul_cache").upsert(
    { data_type: dataType, payload, fetched_at: now, period },
    { onConflict: "data_type" },
  );
  return { status: "ok" };
}

async function syncPaginated(
  supabase: any,
  urlBase: string,
  dataType: string,
  headers: Record<string, string>,
  now: string,
  period: string,
  maxPages = 25,
): Promise<SyncResult> {
  let allItems: any[] = [];
  for (let pagina = 1; pagina <= maxPages; pagina++) {
    const sep = urlBase.includes("?") ? "&" : "?";
    const url = `${urlBase}${sep}pagina=${pagina}&tamanho_pagina=200`;
    const res = await fetch(url, { headers });
    if (res.status === 401) {
      const body = await res.text();
      return { status: "error", message: "invalid_token: " + body };
    }
    if (!res.ok) break;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.itens || data.items || []);
    allItems = allItems.concat(items);
    if (items.length < 200) break;
  }
  await supabase.from("conta_azul_cache").upsert(
    { data_type: dataType, payload: { itens: allItems }, fetched_at: now, period },
    { onConflict: "data_type" },
  );
  return { status: "ok", total: allItems.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const tokenResult = await getValidToken(supabase);
    if ("error" in tokenResult) {
      return new Response(
        JSON.stringify({ error: tokenResult.error, reauth: tokenResult.reauth }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bearerRef = { token: tokenResult.token };
    const now = new Date().toISOString();
    const period = now.slice(0, 7);
    const results: Record<string, any> = {};

    // Define all sync jobs
    const jobs: { key: string; label: string; fn: (headers: Record<string, string>) => Promise<SyncResult> }[] = [
      {
        key: "accounts_v2",
        label: "Contas financeiras",
        fn: (h) => syncSimple(supabase, `${BASE}/v1/conta-financeira`, "accounts_v2", h, now, period),
      },
      {
        key: "categories",
        label: "Categorias",
        fn: (h) => syncSimple(supabase, `${BASE}/v1/categorias?tamanho_pagina=200`, "categories", h, now, period),
      },
      {
        key: "receivables",
        label: "Contas a receber",
        fn: (h) =>
          syncPaginated(
            supabase,
            `${BASE}/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${dataInicio}&data_vencimento_ate=${dataFim}`,
            "receivables",
            h,
            now,
            period,
          ),
      },
      {
        key: "payables",
        label: "Contas a pagar",
        fn: (h) =>
          syncPaginated(
            supabase,
            `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${dataInicio}&data_vencimento_ate=${dataFim}`,
            "payables",
            h,
            now,
            period,
          ),
      },
      {
        key: "sales",
        label: "Vendas",
        fn: (h) => syncPaginated(supabase, `${BASE}/v1/vendas`, "sales", h, now, period),
      },
      {
        key: "transactions",
        label: "Transações",
        fn: (h) =>
          syncPaginated(
            supabase,
            `${BASE}/v1/financeiro/eventos-financeiros/buscar?data_vencimento_de=${dataInicio}&data_vencimento_ate=${dataFim}`,
            "transactions",
            h,
            now,
            period,
          ),
      },
    ];

    let needsReauth = false;

    for (const job of jobs) {
      if (needsReauth) {
        results[job.key] = { status: "skipped", label: job.label };
        continue;
      }
      try {
        const result = await fetchWithRetry(supabase, bearerRef, job.fn);
        if (result.status === "reauth") {
          needsReauth = true;
          results[job.key] = { status: "reauth", label: job.label };
        } else {
          results[job.key] = { ...result, label: job.label };
        }
      } catch (e) {
        results[job.key] = { status: "error", message: String(e), label: job.label };
      }
    }

    if (needsReauth) {
      return new Response(
        JSON.stringify({
          ok: false,
          reauth: true,
          error: "Sessão expirada — faça login novamente na Conta Azul.",
          results,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, synced_at: now, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
