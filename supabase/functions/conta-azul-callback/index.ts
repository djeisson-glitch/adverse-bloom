// Force redeploy v2 - 2026-03-24 - ensure correct redirect_uri
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  const appUrl = Deno.env.get("APP_URL") || "https://adverse-bloom.lovable.app"

  if (error) {
    console.error("[callback] OAuth error param:", error)
    return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_error=${encodeURIComponent(error)}`, 302)
  }

  if (!code) {
    console.error("[callback] Missing code param")
    return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_error=missing_code`, 302)
  }

  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!
  const redirectUri = "https://tappbjqwnwaelrvhcogw.supabase.co/functions/v1/conta-azul-callback"

  console.log("[callback] Code recebido, trocando token...")
  console.log("[callback] client_id:", clientId ? `${clientId.slice(0, 6)}...` : "MISSING")
  console.log("[callback] redirect_uri:", redirectUri)

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  }).toString()

  const tokenRes = await fetch("https://auth.contaazul.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  })

  const tokenText = await tokenRes.text()
  console.log("[callback] Token response status:", tokenRes.status)
  console.log("[callback] Token response body:", tokenText)

  let tokenData: any
  try {
    tokenData = JSON.parse(tokenText)
  } catch {
    console.error("[callback] Failed to parse token response as JSON")
    return Response.redirect(
      `${appUrl}/configuracoes/integracoes?ca_error=${encodeURIComponent(`token_parse_error: ${tokenText.slice(0, 200)}`)}`,
      302,
    )
  }

  if (!tokenData.access_token) {
    console.error("[callback] Token exchange failed:", JSON.stringify(tokenData))
    const errorDetail = tokenData.error_description || tokenData.error || "unknown_error"
    return Response.redirect(
      `${appUrl}/configuracoes/integracoes?ca_error=${encodeURIComponent(`token_exchange_failed: ${errorDetail}`)}`,
      302,
    )
  }

  console.log("[callback] Token obtido com sucesso, salvando...")

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  console.log("[callback] SUPABASE_URL:", supabaseUrl)
  console.log("[callback] SERVICE_KEY present:", !!serviceKey, "length:", serviceKey?.length)

  const supabase = createClient(supabaseUrl, serviceKey)

  const now = new Date().toISOString()
  console.log("[callback] Upserting auth_tokens with fetched_at:", now)

  const { data: upsertData, error: upsertError } = await supabase.from("conta_azul_cache").upsert(
    {
      data_type: "auth_tokens",
      payload: tokenData,
      fetched_at: now,
      period: "auth",
    },
    { onConflict: "data_type" },
  ).select()

  if (upsertError) {
    console.error("[callback] UPSERT ERROR:", JSON.stringify(upsertError))
    return Response.redirect(
      `${appUrl}/configuracoes/integracoes?ca_error=${encodeURIComponent(`upsert_failed: ${upsertError.message}`)}`,
      302,
    )
  }

  console.log("[callback] Upsert OK, rows:", JSON.stringify(upsertData))

  const { data: verifyRow, error: verifyErr } = await supabase
    .from("conta_azul_cache")
    .select("data_type, fetched_at, period")
    .eq("data_type", "auth_tokens")
    .single()

  console.log("[callback] Verify read:", JSON.stringify(verifyRow), "error:", JSON.stringify(verifyErr))
  console.log("[callback] Token salvo, redirecionando para app")
  return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_success=true`, 302)
})