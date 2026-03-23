import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  // App URL for redirects
  const appUrl = Deno.env.get("APP_URL") || "https://adverse-bloom.lovable.app"

  if (error) {
    return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_error=${encodeURIComponent(error)}`, 302)
  }

  if (!code) {
    return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_error=missing_code`, 302)
  }

  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!
  const redirectUri = "https://tappbjqwnwaelrvhcogw.supabase.co/functions/v1/conta-azul-callback"

  const tokenRes = await fetch("https://api.contaazul.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  })

  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    console.error("Token exchange failed:", JSON.stringify(tokenData))
    return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_error=token_exchange_failed`, 302)
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  await supabase.from("conta_azul_cache").upsert({
    data_type: "auth_tokens",
    payload: tokenData,
    fetched_at: new Date().toISOString(),
    period: "auth"
  }, { onConflict: "data_type" })

  return Response.redirect(`${appUrl}/configuracoes/integracoes?ca_success=true`, 302)
})
