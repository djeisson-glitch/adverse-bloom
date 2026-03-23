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

  console.log("[token] Token expirado, tentando refresh...");
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
    console.error("[token] Refresh falhou:", JSON.stringify(tokenData));
    return { error: "Sessão expirada — faça login novamente na Conta Azul.", reauth: true };
  }

  console.log("[token] Refresh OK, novo token obtido");
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
const dataInicio = "2025-01-01";
const dataFim = "2026-12-31";

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

    const token = tokenResult.token;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const now = new Date().toISOString();
    const period = now.slice(0, 7);
    const results: Record<string, any> = {};

    const jobs = [
      { key: "accounts_v2", label: "Contas financeiras", url: `${BASE}/accounts`, paginated: false },
      { key: "categories", label: "Categorias", url: `${BASE}/categories?size=200`, paginated: false },
      { key: "receivables", label: "Contas a receber", url: `${BASE}/receivables?due_date_start=${dataInicio}&due_date_end=${dataFim}`, paginated: true },
      { key: "payables", label: "Contas a pagar", url: `${BASE}/payables?due_date_start=${dataInicio}&due_date_end=${dataFim}`, paginated: true },
      { key: "sales", label: "Vendas", url: `${BASE}/sales?emission_start=${dataInicio}&emission_end=${dataFim}`, paginated: true },
      { key: "transactions", label: "Transações", url: `${BASE}/transactions?date_start=${dataInicio}&date_end=${dataFim}`, paginated: true },
    ];

    for (const job of jobs) {
      const result = await syncEndpoint(supabase, job.label, job.key, job.url, headers, now, period, job.paginated);

      // If we get a token error, try refreshing once
      if (result.status === "error" && result.message?.includes("401")) {
        console.log(`[sync] Token inválido em ${job.label}, tentando refresh...`);
        const refreshResult = await getValidToken(supabase);
        if ("error" in refreshResult) {
          results[job.key] = { status: "reauth", label: job.label };
          // Skip remaining jobs
          for (const remaining of jobs.slice(jobs.indexOf(job) + 1)) {
            results[remaining.key] = { status: "skipped", label: remaining.label };
          }
          return new Response(
            JSON.stringify({ ok: false, reauth: true, error: "Sessão expirada — faça login novamente na Conta Azul.", results }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Retry with new token
        const retryHeaders = { Authorization: `Bearer ${refreshResult.token}`, Accept: "application/json" };
        results[job.key] = await syncEndpoint(supabase, job.label, job.key, job.url, retryHeaders, now, period, job.paginated);
      } else {
        results[job.key] = result;
      }
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
