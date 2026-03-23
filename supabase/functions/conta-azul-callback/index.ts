import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  // App URL for redirects
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

  // Endpoint correto: auth.contaazul.com (não api.contaazul.com)
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  await supabase.from("conta_azul_cache").upsert(
    {
      data_type: "auth_tokens",
      payload: tokenData,
      fetched_at: new Date().toISOString(),
      period: "auth",
    },
    { onConflict: "data_type" },
  )

  console.log("[callback] Token salvo, redirecionando para app")
  return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_success=true`, 302)
})
