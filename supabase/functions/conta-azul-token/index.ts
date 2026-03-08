import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = Deno.env.get("CONTA_AZUL_CLIENT_ID");
  const clientSecret = Deno.env.get("CONTA_AZUL_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("CONTA_AZUL_CLIENT_ID ou CONTA_AZUL_CLIENT_SECRET não configurados");
  }

  const res = await fetch("https://api.contaazul.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro ao obter token: ${res.status} - ${body}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Expire 60s before actual expiry for safety
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;

  return cachedToken!;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = await getToken();
    return new Response(
      JSON.stringify({ access_token: accessToken }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
