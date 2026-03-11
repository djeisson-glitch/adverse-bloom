import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")

  if (!code) {
    return new Response("Missing code", { status: 400 })
  }

  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID")!
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET")!
  const redirectUri = "https://tappbjqwnwaelrvhcogw.supabase.co/functions/v1/conta-azul-callback"

  const tokenRes = await fetch("https://auth.contaazul.com/oauth2/token", {
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
    return new Response(JSON.stringify({ error: "Token exchange failed", detail: tokenData }), {
      status: 400, headers: { "Content-Type": "application/json" }
    })
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

  return new Response("Autenticação concluída com sucesso! Pode fechar esta aba.", {
    status: 200, headers: { "Content-Type": "text/plain" }
  })
})