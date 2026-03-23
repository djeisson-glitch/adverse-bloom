import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(supabase: any): Promise<{ token: string } | { error: string; reauth: boolean }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  console.log("[token] SUPABASE_URL usado pelo sync:", supabaseUrl);

  const { data: authRow, error: fetchError } = await supabase
    .from("conta_azul_cache")
    .select("payload, fetched_at")
    .eq("data_type", "auth_tokens")
    .single();

  if (fetchError) {
    console.error("[token] Erro ao buscar auth_tokens:", JSON.stringify(fetchError));
  }

  if (!authRow) return { error: "Tokens não encontrados. Faça login na Conta Azul.", reauth: true };

  const payload = authRow.payload;
  console.log("[token] auth_tokens fetched_at:", authRow.fetched_at);
  console.log("[token] payload keys:", Object.keys(payload));
  console.log("[token] access_token prefix:", payload.access_token?.slice(0, 20) + "...");
  console.log("[token] refresh_token present:", !!payload.refresh_token);
  console.log("[token] expires_in:", payload.expires_in);
  console.log("[token] token_type:", payload.token_type);

  const fetchedAt = new Date(authRow.fetched_at).getTime();
  const expiresIn = payload.expires_in || 3600;
  const expiresAt = fetchedAt + expiresIn * 1000;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  console.log("[token] fetchedAt:", new Date(fetchedAt).toISOString(), "expiresAt:", new Date(expiresAt).toISOString(), "now:", new Date(now).toISOString());

  if (payload.access_token && now < expiresAt - fiveMinutes) {
    console.log("[token] Token parece válido por tempo, expira em", Math.round((expiresAt - now) / 60000), "min");
    return { token: payload.access_token };
  }

  if (!payload.refresh_token) {
    console.error("[token] Sem refresh_token no payload, keys:", Object.keys(payload));
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

  console.log("[token] Token expirado, tentando refresh...");
  console.log("[token] refresh_token prefix:", payload.refresh_token.slice(0, 20) + "...");
  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!;
  console.log("[token] client_id prefix:", clientId?.slice(0, 8) + "...");

  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: payload.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  const tokenRes = await fetch("https://api.contaazul.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: refreshBody,
  });

  const tokenText = await tokenRes.text();
  console.log("[token] Refresh response status:", tokenRes.status);
  console.log("[token] Refresh response body:", tokenText);

  let tokenData: any;
  try {
    tokenData = JSON.parse(tokenText);
  } catch {
    console.error("[token] Refresh response não é JSON:", tokenText.slice(0, 300));
    return { error: "Erro ao renovar token da Conta Azul.", reauth: true };
  }

  if (!tokenData.access_token) {
    console.error("[token] Refresh falhou:", JSON.stringify(tokenData));
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

  console.log("[token] Refresh OK, novo access_token prefix:", tokenData.access_token.slice(0, 20) + "...");
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

const BASE = "https://api.contaazul.com/v2";
const BASE_V1 = "https://api.contaazul.com/v1";
const dataInicio = "2025-01-01";
const dataFim = new Date().toISOString().slice(0, 10);
const dataInicioEmpresa = "2023-06-05";

async function syncEndpoint(
  supabase: any,
  label: string,
  dataType: string,
  url: string,
  headers: Record<string, string>,
  now: string,
  period: string,
  paginated: boolean,
): Promise<{ status: string; label: string; total?: number; message?: string }> {
  console.log(`[sync] Iniciando: ${label} → ${url}`);
  try {
    if (!paginated) {
      const res = await fetch(url, { headers });
      console.log(`[sync] ${label}: HTTP ${res.status}`);
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
      const pageUrl = `${url}${sep}page=${pagina}&size=200`;
      const res = await fetch(pageUrl, { headers });
      console.log(`[sync] ${label} página ${pagina}: HTTP ${res.status}`);
      if (!res.ok) {
        const body = await res.text();
        if (pagina === 1) {
          console.error(`[sync] ${label} FALHOU na primeira página: ${body}`);
          return { status: "error", label, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        break;
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.itens || data.items || data.data || []);
      allItems = allItems.concat(items);
      console.log(`[sync] ${label} página ${pagina}: ${items.length} itens (total acumulado: ${allItems.length})`);
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

    let token = tokenResult.token;
    let headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const now = new Date().toISOString();
    const period = now.slice(0, 7);
    const results: Record<string, any> = {};

    const jobs = [
      { key: "accounts_v2", label: "Contas financeiras", url: `${BASE}/accounts`, paginated: false },
      { key: "categories", label: "Categorias", url: `${BASE}/categories?size=200`, paginated: false },
      { key: "receivables", label: "Contas a receber", url: `${BASE}/receivables?due_date_start=${dataInicio}&due_date_end=${dataFim}`, paginated: true },
      { key: "payables", label: "Contas a pagar", url: `${BASE}/payables?due_date_start=${dataInicio}&due_date_end=${dataFim}`, paginated: true },
    ];

    let needsReauth = false;

    for (const job of jobs) {
      const result = await syncEndpoint(supabase, job.label, job.key, job.url, headers, now, period, job.paginated);

      if (result.status === "error" && result.message?.includes("401")) {
        console.log(`[sync] Token inválido em ${job.label}, tentando refresh...`);
        const refreshResult = await getValidToken(supabase);
        if ("error" in refreshResult) {
          needsReauth = true;
          results[job.key] = { status: "reauth", label: job.label };
          break;
        }
        token = refreshResult.token;
        headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
        const retryResult = await syncEndpoint(supabase, job.label, job.key, job.url, headers, now, period, job.paginated);
        if (retryResult.status === "error" && retryResult.message?.includes("401")) {
          needsReauth = true;
          results[job.key] = { status: "reauth", label: job.label };
          break;
        }
        results[job.key] = retryResult;
      } else {
        results[job.key] = result;
      }
    }

    if (needsReauth) {
      console.log("[sync] Reauth necessário, retornando ao frontend");
      return new Response(
        JSON.stringify({ ok: false, reauth: true, error: "Sessão expirada — faça login novamente na Conta Azul.", results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SALES (notas fiscais emitidas) - v1 endpoint
    try {
      let allSales: any[] = [];
      let page = 1;
      while (true) {
        const url = `${BASE_V1}/notas-fiscais-servico?pagina=${page}&tamanho_pagina=100&data_emissao_de=${dataInicioEmpresa}&data_emissao_ate=${dataFim}`;
        console.log(`[sync] Sales página ${page}: ${url}`);
        const res = await fetch(url, { headers });
        console.log(`[sync] Sales página ${page}: HTTP ${res.status}`);
        if (!res.ok) {
          const body = await res.text();
          console.error(`[sync] Sales FALHOU: ${body}`);
          results["sales"] = { status: "error", label: "Vendas (NFS)", message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
          break;
        }
        const data = await res.json();
        const items = data.itens || data.content || (Array.isArray(data) ? data : []);
        if (!Array.isArray(items) || items.length === 0) break;
        allSales = allSales.concat(items);
        console.log(`[sync] Sales página ${page}: ${items.length} itens (total: ${allSales.length})`);
        if (items.length < 100) break;
        page++;
      }
      if (allSales.length > 0) {
        await supabase.from("conta_azul_cache").upsert(
          { data_type: "sales", payload: { itens: allSales }, fetched_at: now, period },
          { onConflict: "data_type" },
        );
        results["sales"] = { status: "ok", label: "Vendas (NFS)", total: allSales.length };
        console.log(`[sync] Sales: OK (${allSales.length} registros)`);
      } else if (!results["sales"]) {
        results["sales"] = { status: "ok", label: "Vendas (NFS)", total: 0 };
      }
    } catch (e) {
      console.error(`[sync] Sales ERRO:`, String(e));
      results["sales"] = { status: "error", label: "Vendas (NFS)", message: String(e) };
    }

    // TRANSACTIONS (lançamentos financeiros) - v1 endpoint
    try {
      let allTx: any[] = [];
      let page = 1;
      while (true) {
        const url = `${BASE_V1}/financeiro/lancamentos?pagina=${page}&tamanho_pagina=100&data_lancamento_de=${dataInicioEmpresa}&data_lancamento_ate=${dataFim}`;
        console.log(`[sync] Transactions página ${page}: ${url}`);
        const res = await fetch(url, { headers });
        console.log(`[sync] Transactions página ${page}: HTTP ${res.status}`);
        if (!res.ok) {
          const body = await res.text();
          console.error(`[sync] Transactions FALHOU: ${body}`);
          results["transactions"] = { status: "error", label: "Transações", message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
          break;
        }
        const data = await res.json();
        const items = data.itens || data.content || (Array.isArray(data) ? data : []);
        if (!Array.isArray(items) || items.length === 0) break;
        allTx = allTx.concat(items);
        console.log(`[sync] Transactions página ${page}: ${items.length} itens (total: ${allTx.length})`);
        if (items.length < 100) break;
        page++;
      }
      if (allTx.length > 0) {
        await supabase.from("conta_azul_cache").upsert(
          { data_type: "transactions", payload: { itens: allTx }, fetched_at: now, period },
          { onConflict: "data_type" },
        );
        results["transactions"] = { status: "ok", label: "Transações", total: allTx.length };
        console.log(`[sync] Transactions: OK (${allTx.length} registros)`);
      } else if (!results["transactions"]) {
        results["transactions"] = { status: "ok", label: "Transações", total: 0 };
      }
    } catch (e) {
      console.error(`[sync] Transactions ERRO:`, String(e));
      results["transactions"] = { status: "error", label: "Transações", message: String(e) };
    }

    console.log("[sync] Resultado final:", JSON.stringify(results));

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
