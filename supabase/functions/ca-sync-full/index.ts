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
    console.log("[token] Token válido, expira em", Math.round((expiresAt - now) / 60000), "min");
    return { token: payload.access_token };
  }

  if (!payload.refresh_token) {
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

  return await refreshToken(supabase, payload);
}

async function refreshToken(supabase: any, payload: any): Promise<{ token: string } | { error: string; reauth: boolean }> {
  console.log("[token] Tentando refresh...");
  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!;
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const tokenRes = await fetch("https://auth.contaazul.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: payload.refresh_token,
    }).toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error("[token] Refresh falhou:", JSON.stringify(tokenData));
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

  console.log("[token] Refresh OK");
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

const BASE = "https://api-v2.contaazul.com/v1";
const dataInicio = "2025-01-01";
const dataFim = "2026-12-31";
// Force redeploy v3 - host correto é api-v2.contaazul.com/v1

type SyncResult = { status: string; label: string; total?: number; message?: string };

async function syncEndpoint(
  supabase: any,
  label: string,
  dataType: string,
  url: string,
  headers: Record<string, string>,
  now: string,
  period: string,
  paginated: boolean,
): Promise<SyncResult> {
  console.log(`[sync] Iniciando: ${label} → ${url}`);
  try {
    if (!paginated) {
      const res = await fetch(url, { headers });
      console.log(`[sync] ${label}: HTTP ${res.status}`);
      if (res.status === 401) {
        const body = await res.text();
        return { status: "error", label, message: `401: ${body.slice(0, 200)}` };
      }
      if (!res.ok) {
        const body = await res.text();
        console.error(`[sync] ${label} FALHOU: ${body}`);
        return { status: "error", label, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const payload = await res.json();
      const items = Array.isArray(payload) ? payload : (payload.itens || payload.items || payload.data || []);
      await supabase.from("conta_azul_cache").upsert(
        { data_type: dataType, payload, fetched_at: now, period },
        { onConflict: "data_type" },
      );
      console.log(`[sync] ${label}: OK (${Array.isArray(items) ? items.length : '?'} registros)`);
      return { status: "ok", label, total: Array.isArray(items) ? items.length : undefined };
    }

    // Paginated
    let allItems: any[] = [];
    for (let pagina = 1; pagina <= 25; pagina++) {
      const sep = url.includes("?") ? "&" : "?";
      const pageUrl = `${url}${sep}pagina=${pagina}&tamanho_pagina=200`;
      const res = await fetch(pageUrl, { headers });
      console.log(`[sync] ${label} página ${pagina}: HTTP ${res.status}`);
      if (res.status === 401) {
        const body = await res.text();
        if (pagina === 1) return { status: "error", label, message: `401: ${body.slice(0, 200)}` };
        break;
      }
      if (!res.ok) {
        if (pagina === 1) {
          const body = await res.text();
          console.error(`[sync] ${label} FALHOU: ${body}`);
          return { status: "error", label, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        break;
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.itens || data.items || data.data || []);
      allItems = allItems.concat(items);
      console.log(`[sync] ${label} página ${pagina}: ${items.length} itens (total: ${allItems.length})`);
      if (items.length < 200) break;
    }
    await supabase.from("conta_azul_cache").upsert(
      { data_type: dataType, payload: { itens: allItems }, fetched_at: now, period },
      { onConflict: "data_type" },
    );
    console.log(`[sync] ${label}: OK (${allItems.length} registros total)`);
    return { status: "ok", label, total: allItems.length };
  } catch (e) {
    console.error(`[sync] ${label} ERRO:`, String(e));
    return { status: "error", label, message: String(e) };
  }
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

    let currentToken = tokenResult.token;
    const now = new Date().toISOString();
    const period = now.slice(0, 7);
    const results: Record<string, SyncResult> = {};

    const jobs = [
      { key: "accounts_v2", label: "Contas financeiras", url: `${BASE}/conta-financeira`, paginated: false },
      { key: "categories", label: "Categorias", url: `${BASE}/categorias?tamanho_pagina=200`, paginated: false },
      { key: "receivables", label: "Contas a receber", url: `${BASE}/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_inicio=${dataInicio}&data_vencimento_fim=${dataFim}`, paginated: true },
      { key: "payables", label: "Contas a pagar", url: `${BASE}/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_inicio=${dataInicio}&data_vencimento_fim=${dataFim}`, paginated: true },
      { key: "sales", label: "Vendas", url: `${BASE}/vendas?sort=EMISSION_DATE&order=DESC&emit_date_from=${dataInicio}&emit_date_to=${dataFim}`, paginated: true },
      { key: "transactions", label: "Transações", url: `${BASE}/financeiro/eventos-financeiros?data_competencia_inicio=${dataInicio}&data_competencia_fim=${dataFim}`, paginated: true },
    ];

    let needsReauth = false;

    for (const job of jobs) {
      if (needsReauth) {
        results[job.key] = { status: "skipped", label: job.label };
        continue;
      }

      const headers = { Authorization: `Bearer ${currentToken}`, Accept: "application/json" };
      let result = await syncEndpoint(supabase, job.label, job.key, job.url, headers, now, period, job.paginated);

      // Auto-retry on 401
      if (result.status === "error" && result.message?.includes("401")) {
        console.log(`[sync] 401 em ${job.label}, tentando refresh e retry...`);
        const { data: authRow } = await supabase
          .from("conta_azul_cache")
          .select("payload")
          .eq("data_type", "auth_tokens")
          .single();

        if (!authRow?.payload?.refresh_token) {
          needsReauth = true;
          results[job.key] = { status: "reauth", label: job.label };
          continue;
        }

        const refreshResult = await refreshToken(supabase, authRow.payload);
        if ("error" in refreshResult) {
          needsReauth = true;
          results[job.key] = { status: "reauth", label: job.label };
          continue;
        }

        currentToken = refreshResult.token;
        const retryHeaders = { Authorization: `Bearer ${currentToken}`, Accept: "application/json" };
        result = await syncEndpoint(supabase, job.label, job.key, job.url, retryHeaders, now, period, job.paginated);
      }

      results[job.key] = result;
    }

    console.log("[sync] Resultado final:", JSON.stringify(results));

    if (needsReauth) {
      return new Response(
        JSON.stringify({ ok: false, reauth: true, error: "Sessão expirada — faça login novamente na Conta Azul.", results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, synced_at: now, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync] Erro geral:", String(e));
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
