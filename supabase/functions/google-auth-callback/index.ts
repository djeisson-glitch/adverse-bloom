import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // team_member_id

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // The redirect URI must match exactly what's configured in Google Console
  const redirectUri = `${supabaseUrl}/functions/v1/google-auth-callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token || !tokenData.refresh_token) {
    console.error("Token exchange failed:", tokenData);
    return new Response("Failed to get tokens. Make sure 'access_type=offline' was used.", { status: 400 });
  }

  // Get user email
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userInfo = await userInfoRes.json();

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Upsert token for this team member
  const { error } = await supabase
    .from("google_tokens")
    .upsert(
      {
        team_member_id: state,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        google_email: userInfo.email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_member_id" }
    );

  if (error) {
    console.error("DB error:", error);
    return new Response("Failed to save tokens", { status: 500 });
  }

  // Redirect back to the app with success
  const appUrl = Deno.env.get("APP_URL") || "https://adverse-bloom.lovable.app";
  return new Response(null, {
    status: 302,
    headers: { Location: `${appUrl}/agenda?google_connected=1` },
  });
});
