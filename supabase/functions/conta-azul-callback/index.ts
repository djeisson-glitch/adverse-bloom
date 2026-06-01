// Force redeploy v3 - 2026-03-24 - use Basic auth per official docs
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function toBase64(str: string): string {
  return btoa(str);
}

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
  const redirectUri = Deno.env.get("CONTA_AZUL_REDIRECT_URI") || "https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/conta-azul-callback"
  const basicAuth = toBase64(`${clientId}:${clientSecret}`)

  console.log("[callback] Code recebido, trocando token...")
  console.log("[callback] client_id:", clientId ? `${clientId.slice(0, 6)}...` : "MISSING")
  console.log("[callback] redirect_uri:", redirectUri)
  console.log("[callback] Using Basic auth header")

  // Per Conta Azul docs: use Authorization: Basic BASE64(client_id:client_secret)
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }).toString()

  const tokenRes = await fetch("https://auth.contaazul.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
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
  console.log("[callback] Token salvo, redirecionando para app")
  return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_success=true`, 302)
})