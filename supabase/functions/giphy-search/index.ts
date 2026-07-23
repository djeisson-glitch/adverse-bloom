import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// =========================================================================
// giphy-search — busca de GIFs pro chat, via Giphy. A key fica aqui (secret
// GIPHY_API_KEY), nunca no bundle do front. Sem termo, devolve os em alta.
//
// Autenticada (verify_jwt padrão = true): só time logado busca GIF, pra
// ninguém de fora queimar a cota da key.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const key = Deno.env.get("GIPHY_API_KEY");
    // Chave ausente é ESTADO de configuração, não erro de servidor — devolve 200
    // pra o front mostrar a mensagem específica (invoke() só lança em não-2xx).
    if (!key) return json({ error: "GIF não configurado — falta a chave GIPHY_API_KEY.", gifs: [] }, 200);

    const body = await req.json().catch(() => ({}));
    const q = (body?.q || "").toString().trim().slice(0, 60);

    const base = q
      ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q)}&`
      : `https://api.giphy.com/v1/gifs/trending?`;
    const url = `${base}api_key=${key}&limit=24&rating=pg-13&lang=pt`;

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("Giphy error:", resp.status, (await resp.text()).slice(0, 200));
      return json({ error: "Erro ao buscar GIFs.", gifs: [] }, 502);
    }
    const data = await resp.json();

    // Só o que o front precisa: preview leve pra grade e a URL do gif pra mandar.
    const gifs = (Array.isArray(data?.data) ? data.data : []).map((g: any) => ({
      id: g.id,
      preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url,
      url: g.images?.downsized_medium?.url || g.images?.fixed_height?.url || g.images?.original?.url,
      w: Number(g.images?.fixed_width?.width) || 200,
      h: Number(g.images?.fixed_width?.height) || 200,
    })).filter((g: any) => g.preview && g.url);

    return json({ gifs });
  } catch (e) {
    console.error("giphy-search error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido", gifs: [] }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
