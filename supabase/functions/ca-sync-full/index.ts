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

  // Token still valid (more than 5 min remaining)
  if (payload.access_token && now < expiresAt - fiveMinutes) {
    return { token: payload.access_token };
  }

  // Token expired or about to expire — refresh
  if (!payload.refresh_token) {
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

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

  // Save new tokens
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

    const token = tokenResult.token;
    const bearer = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const now = new Date().toISOString();
    const period = now.slice(0, 7);
    const results: Record<string, any> = {};
    const BASE = "https://api-v2.contaazul.com";
    const dataInicio = "2024-01-01";
    const dataFim = "2026-12-31";

    // Accounts
    try {
      const res = await fetch(`${BASE}/v1/conta-financeira`, { headers: bearer });
      results["accounts"] = { status: res.status };
      if (res.ok)
        await supabase
          .from("conta_azul_cache")
          .upsert(
            { data_type: "accounts", payload: await res.json(), fetched_at: now, period },
            { onConflict: "data_type" },
          );
    } catch (e) {
      results["accounts"] = { error: String(e) };
    }

    // Categories
    try {
      const res = await fetch(`${BASE}/v1/categorias?tamanho_pagina=200`, { headers: bearer });
      results["categories"] = { status: res.status };
      if (res.ok)
        await supabase
          .from("conta_azul_cache")
          .upsert(
            { data_type: "categories", payload: await res.json(), fetched_at: now, period },
            { onConflict: "data_type" },
          );
    } catch (e) {
      results["categories"] = { error: String(e) };
    }

    // Receivables - up to 25 pages (5000 items)
    try {
      let allItems: any[] = [];
      for (let pagina = 1; pagina <= 25; pagina++) {
        const url = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?pagina=${pagina}&tamanho_pagina=200&data_vencimento_de=${dataInicio}&data_vencimento_ate=${dataFim}`;
        const res = await fetch(url, { headers: bearer });
        if (!res.ok) break;
        const data = await res.json();
        const items = data.itens || [];
        allItems = allItems.concat(items);
        if (items.length < 200) break;
      }
      await supabase
        .from("conta_azul_cache")
        .upsert(
          { data_type: "receivables", payload: { itens: allItems }, fetched_at: now, period },
          { onConflict: "data_type" },
        );
      results["receivables"] = { total: allItems.length };
    } catch (e) {
      results["receivables"] = { error: String(e) };
    }

    // Payables - up to 25 pages (5000 items)
    try {
      let allItems: any[] = [];
      for (let pagina = 1; pagina <= 25; pagina++) {
        const url = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=${pagina}&tamanho_pagina=200&data_vencimento_de=${dataInicio}&data_vencimento_ate=${dataFim}`;
        const res = await fetch(url, { headers: bearer });
        if (!res.ok) break;
        const data = await res.json();
        const items = data.itens || [];
        allItems = allItems.concat(items);
        if (items.length < 200) break;
      }
      await supabase
        .from("conta_azul_cache")
        .upsert(
          { data_type: "payables", payload: { itens: allItems }, fetched_at: now, period },
          { onConflict: "data_type" },
        );
      results["payables"] = { total: allItems.length };
    } catch (e) {
      results["payables"] = { error: String(e) };
    }

    // Sales - up to 25 pages
    try {
      let allItems: any[] = [];
      for (let pagina = 1; pagina <= 25; pagina++) {
        const url = `${BASE}/v1/vendas?pagina=${pagina}&tamanho_pagina=200`;
        const res = await fetch(url, { headers: bearer });
        if (!res.ok) break;
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.items || []);
        allItems = allItems.concat(items);
        if (items.length < 200) break;
      }
      await supabase
        .from("conta_azul_cache")
        .upsert(
          { data_type: "sales", payload: { itens: allItems }, fetched_at: now, period },
          { onConflict: "data_type" },
        );
      results["sales"] = { total: allItems.length };
    } catch (e) {
      results["sales"] = { error: String(e) };
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
