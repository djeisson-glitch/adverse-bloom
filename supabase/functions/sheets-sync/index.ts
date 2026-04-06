import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SPREADSHEET_ID = "1OmvnHOUjZWrFf4vCiqKjQCs6GrU8Q5EqxprHLAQgZjI";

async function fetchSheet(apiKey: string, range: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets API error [${res.status}]: ${body}`);
  }
  const data = await res.json();
  return data.values || [];
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || "";
    });
    return obj;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!apiKey) throw new Error("GOOGLE_SHEETS_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all 3 sheets in parallel
    const [receitasRaw, despesasRaw, categoriasRaw] = await Promise.all([
      fetchSheet(apiKey, "Receitas!A:J"),
      fetchSheet(apiKey, "Despesas!A:J"),
      fetchSheet(apiKey, "Categorias!A:B"),
    ]);

    const receitas = rowsToObjects(receitasRaw);
    const despesas = rowsToObjects(despesasRaw);
    const categorias = rowsToObjects(categoriasRaw);

    // Build receivables payload
    const recItens = receitas.map((r) => ({
      id: r.id || "",
      total: parseFloat(r.total) || 0,
      pago: parseFloat(r.pago) || 0,
      status: r.status || "",
      status_traduzido: r.status_traduzido || "",
      data_vencimento: r.data_vencimento || "",
      data_competencia: r.data_competencia || "",
      categorias: [{ nome: r.categoria || "" }],
      cliente: { nome: r.cliente || "" },
      fornecedor: { nome: "" },
      descricao: r.descricao || "",
    }));

    const pagoTotal = recItens
      .filter((r) => r.status === "ACQUITTED")
      .reduce((s, r) => s + r.pago, 0);

    const receivablesPayload = {
      totais: { pago: { valor: pagoTotal } },
      itens: recItens,
    };

    // Build payables payload
    const payItens = despesas.map((r) => ({
      id: r.id || "",
      total: parseFloat(r.total) || 0,
      pago: parseFloat(r.pago) || 0,
      status: r.status || "",
      status_traduzido: r.status_traduzido || "",
      data_vencimento: r.data_vencimento || "",
      data_competencia: r.data_competencia || "",
      categorias: [{ nome: r.categoria || "" }],
      cliente: { nome: "" },
      fornecedor: { nome: r.fornecedor || "" },
      descricao: r.descricao || "",
    }));

    const pagoTotalPay = payItens
      .filter((r) => r.status === "ACQUITTED")
      .reduce((s, r) => s + r.pago, 0);

    const payablesPayload = {
      totais: { pago: { valor: pagoTotalPay } },
      itens: payItens,
    };

    // Build categories payload
    const categoriesPayload = categorias.map((r) => ({
      id: r.categoria || r.nome || "",
      nome: r.categoria || r.nome || "",
      tipo: r.tipo || "",
    }));

    // Upsert into conta_azul_cache
    const now = new Date().toISOString();

    for (const [dataType, payload] of [
      ["receivables", receivablesPayload],
      ["payables", payablesPayload],
      ["categories", categoriesPayload],
    ] as const) {
      // Delete existing then insert (same pattern as conta-azul-sync)
      await supabase
        .from("conta_azul_cache")
        .delete()
        .eq("data_type", dataType);

      const { error } = await supabase.from("conta_azul_cache").insert({
        data_type: dataType,
        payload: payload as any,
        fetched_at: now,
      });

      if (error) {
        throw new Error(`Failed to save ${dataType}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: ["receivables", "payables", "categories"],
        counts: {
          receivables: recItens.length,
          payables: payItens.length,
          categories: categoriesPayload.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sheets-sync error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
