import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toBase64(str: string): string {
  return btoa(str);
}

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
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

  console.log("[token] Token expirado, tentando refresh...");
  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!;
  const basicAuth = toBase64(`${clientId}:${clientSecret}`);

  // Per Conta Azul docs: use Basic auth header for token refresh
  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: payload.refresh_token,
  }).toString();

  const tokenRes = await fetch("https://auth.contaazul.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: refreshBody,
  });

  const tokenText = await tokenRes.text();
  console.log("[token] Refresh response status:", tokenRes.status);
  console.log("[token] Refresh response body:", tokenText.slice(0, 500));

  let tokenData: any;
  try {
    tokenData = JSON.parse(tokenText);
  } catch {
    return { error: "Erro ao renovar token da Conta Azul.", reauth: true };
  }

  if (!tokenData.access_token) {
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

// Conta Azul Financial API (v1)
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
        return { status: "error", label, message: `HTTP ${res.status}: ${body}` };
      }
      const payload = await res.json();
      const items = Array.isArray(payload) ? payload : payload.itens || payload.items || payload.data || [];
      await supabase
        .from("conta_azul_cache")
        .upsert({ data_type: dataType, payload, fetched_at: now, period }, { onConflict: "data_type" });
      console.log(`[sync] ${label}: OK (${Array.isArray(items) ? items.length : "?"} registros)`);
      return { status: "ok", label, total: Array.isArray(items) ? items.length : undefined };
    }

    // Paginated
    let allItems: any[] = [];
    for (let pagina = 1; pagina <= 25; pagina++) {
      const sep = url.includes("?") ? "&" : "?";
      const pageUrl = `${url}${sep}pagina=${pagina}&tamanho_pagina=200`;
      const res = await fetch(pageUrl, { headers });
      console.log(`[sync] ${label} página ${pagina}: HTTP ${res.status}`);
      if (!res.ok) {
        const body = await res.text();
        if (pagina === 1) {
          console.error(`[sync] ${label} FALHOU na primeira página: ${body}`);
          return { status: "error", label, message: `HTTP ${res.status}: ${body}` };
        }
        break;
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.itens || data.items || data.data || [];
      allItems = allItems.concat(items);
      console.log(`[sync] ${label} página ${pagina}: ${items.length} itens (total: ${allItems.length})`);
      if (items.length < 200) break;
    }
    await supabase
      .from("conta_azul_cache")
      .upsert(
        { data_type: dataType, payload: { itens: allItems }, fetched_at: now, period },
        { onConflict: "data_type" },
      );
    console.log(`[sync] ${label}: OK (${allItems.length} registros total)`);
    return { status: "ok", label, total: allItems.length };
  }
}

    const jobs = [
      { key: "accounts_v2", label: "Contas financeiras", url: `${BASE_V1}/conta-financeira`, paginated: false },
      { key: "categories", label: "Categorias", url: `${BASE_V1}/categorias`, paginated: true },
      {
        key: "receivables",
        label: "Contas a receber",
        url: `${BASE_V1}/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_inicio=${dataInicio}&data_vencimento_fim=${dataFim}`,
        paginated: true,
      },
      {
        key: "payables",
        label: "Contas a pagar",
        url: `${BASE_V1}/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_inicio=${dataInicio}&data_vencimento_fim=${dataFim}`,
        paginated: true,
      },
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
        JSON.stringify({
          ok: false,
          reauth: true,
          error: "Sessão expirada — faça login novamente na Conta Azul.",
          results,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SALES
    try {
      let allSales: any[] = [];
      let page = 1;
      while (true) {
        const url = `${BASE_V1}/notas-fiscais-servico?pagina=${page}&tamanho_pagina=100&data_emissao_de=${dataInicioEmpresa}&data_emissao_ate=${dataFim}`;
        const res = await fetch(url, { headers });
        if (!res.ok) { await res.text(); break; }
        const data = await res.json();
        const items = data.itens || data.content || (Array.isArray(data) ? data : []);
        if (!Array.isArray(items) || items.length === 0) break;
        allSales = allSales.concat(items);
        if (items.length < 100) break;
        page++;
      }
      if (allSales.length > 0) {
        await supabase.from("conta_azul_cache").upsert(
          { data_type: "sales", payload: { itens: allSales }, fetched_at: now, period },
          { onConflict: "data_type" },
        );
      }
      results["sales"] = { status: "ok", label: "Vendas (NFS)", total: allSales.length };
    } catch (e) {
      results["sales"] = { status: "error", label: "Vendas", message: String(e) };
    }

    // TRANSACTIONS
    try {
      let allTx: any[] = [];
      let page = 1;
      while (true) {
        const url = `${BASE_V1}/financeiro/lancamentos?pagina=${page}&tamanho_pagina=100&data_lancamento_de=${dataInicioEmpresa}&data_lancamento_ate=${dataFim}`;
        const res = await fetch(url, { headers });
        if (!res.ok) { await res.text(); break; }
        const data = await res.json();
        const items = data.itens || data.content || (Array.isArray(data) ? data : []);
        if (!Array.isArray(items) || items.length === 0) break;
        allTx = allTx.concat(items);
        if (items.length < 100) break;
        page++;
      }
      if (allTx.length > 0) {
        await supabase.from("conta_azul_cache").upsert(
          { data_type: "transactions", payload: { itens: allTx }, fetched_at: now, period },
          { onConflict: "data_type" },
        );
      }
      results["transactions"] = { status: "ok", label: "Transações", total: allTx.length };
    } catch (e) {
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