import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: authRow } = await supabase
      .from("conta_azul_cache").select("payload").eq("data_type", "auth_tokens").single()

    if (!authRow) return new Response(JSON.stringify({ error: "Tokens nao encontrados." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })

    const tokenRes = await fetch("https://auth.contaazul.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: authRow.payload.refresh_token,
        client_id: Deno.env.get("CONTA_AZUL_CLIENT_ID")!,
        client_secret: Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!
      }).toString()
    })

    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return new Response(JSON.stringify({ error: "Token falhou", detail: tokenData }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    await supabase.from("conta_azul_cache").upsert({
      data_type: "auth_tokens", payload: { ...authRow.payload, ...tokenData },
      fetched_at: new Date().toISOString(), period: "auth"
    }, { onConflict: "data_type" })

    const token = tokenData.access_token
    const bearer = { Authorization: `Bearer ${token}`, Accept: "application/json" }
    const now = new Date().toISOString()
    const period = now.slice(0, 7)
    const results: Record<string, any> = {}
    const BASE = "https://api-v2.contaazul.com"
    const anoAtual = new Date().getFullYear()
    const dataInicio = `${anoAtual - 1}-01-01`
    const dataFim = `${anoAtual}-12-31`

    async function fetchPaginated(urlBase: string, headers: Record<string, string>): Promise<any[]> {
      const allItems: any[] = []
      for (let page = 1; page <= 10; page++) {
        const sep = urlBase.includes("?") ? "&" : "?"
        const url = `${urlBase}${sep}pagina=${page}&tamanho_pagina=200`
        const res = await fetch(url, { headers })
        if (!res.ok) break
        const data = await res.json()
        const items = Array.isArray(data) ? data : (data.itens || data.items || [])
        allItems.push(...items)
        if (items.length < 200) break
      }
      return allItems
    }

    return new Response(JSON.stringify({ ok: true, synced_at: now, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch(e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})