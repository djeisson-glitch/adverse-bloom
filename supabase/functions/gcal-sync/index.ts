import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TZ = "America/Sao_Paulo";

const TIPO_META: Record<string, { emoji: string; label: string }> = {
  diaria: { emoji: "🎥", label: "Diária de gravação" },
  visita_tecnica: { emoji: "🔎", label: "Visita técnica" },
  saida: { emoji: "🚐", label: "Saída de produção" },
};

// ---------- Service Account → OAuth access token (JWT bearer) ----------

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlJson(header)}.${b64urlJson(claim)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Google token: " + JSON.stringify(data));
  return data.access_token as string;
}

// ---------- Calendar REST helpers ----------

function calUrl(calendarId: string, eventId?: string) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

function nextDay(dateStr: string): string {
  // dateStr = YYYY-MM-DD ; soma 1 dia (fim exclusivo do all-day no Google)
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function addHours(time: string, hours: number): string {
  const [h, mi] = time.split(":").map(Number);
  const total = h * 60 + mi + hours * 60;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

function buildEvent(saida: any, membros: Map<string, string>) {
  const meta = TIPO_META[saida.tipo] || TIPO_META.saida;
  const summary = `${meta.emoji} ${saida.titulo}`;

  const equipeNomes = (saida.equipe || [])
    .map((id: string) => membros.get(id))
    .filter(Boolean);
  const responsavel = saida.responsavel_id ? membros.get(saida.responsavel_id) : null;

  const descLinhas = [
    `${meta.label}`,
    saida.project_name ? `Projeto: ${saida.project_name}` : "",
    responsavel ? `Responsável: ${responsavel}` : "",
    equipeNomes.length ? `Equipe: ${equipeNomes.join(", ")}` : "",
    saida.observacoes ? `\n${saida.observacoes}` : "",
    `\n— lançado no Adverse OS`,
  ].filter(Boolean);

  const ev: any = {
    summary,
    location: saida.local || undefined,
    description: descLinhas.join("\n"),
  };

  const semHora = saida.dia_inteiro || !saida.hora_inicio;
  if (semHora) {
    ev.start = { date: saida.data };
    ev.end = { date: nextDay(saida.data) };
  } else {
    const fim = saida.hora_fim || addHours(saida.hora_inicio, saida.tipo === "diaria" ? 8 : 2);
    ev.start = { dateTime: `${saida.data}T${saida.hora_inicio}`, timeZone: TZ };
    ev.end = { dateTime: `${saida.data}T${fim}`, timeZone: TZ };
  }
  return ev;
}

// ---------- Main ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const calendarId = Deno.env.get("GCAL_CALENDAR_ID") || "";
  const saJsonRaw = Deno.env.get("GCAL_SA_JSON") || "";
  const configured = !!calendarId && !!saJsonRaw;

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* GET/sem body */ }
  const action = body.action || "status";

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // status: a UI pergunta se a integração está pronta
  if (action === "status") {
    return json({ configured, calendarId: configured ? calendarId : null });
  }

  // Se não está configurado, não estoura — só avisa. A saída já foi salva no OS.
  if (!configured) {
    return json({ ok: true, skipped: true, reason: "not_configured" });
  }

  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(saJsonRaw);
    if (!sa.client_email || !sa.private_key) throw new Error("faltam client_email/private_key");
  } catch (e) {
    return json({ error: "GCAL_SA_JSON inválido: " + String(e) }, 500);
  }

  // Resolve nomes do time uma vez (pra descrição do evento)
  const membros = new Map<string, string>();
  {
    const { data: tm } = await supabase.from("team_members").select("id, name");
    (tm || []).forEach((m: any) => membros.set(m.id, m.name));
  }

  async function carregarSaida(id: string) {
    const { data } = await supabase
      .from("producao_saidas")
      .select("*, project:projects(name)")
      .eq("id", id)
      .single();
    if (data) (data as any).project_name = (data as any).project?.name || null;
    return data as any;
  }

  try {
    const accessToken = await getAccessToken(sa);
    const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // ---- delete: remove o evento do Google (a linha some/vira cancelada no app) ----
    if (action === "delete") {
      const saida = await carregarSaida(body.saida_id);
      if (saida?.gcal_event_id) {
        const res = await fetch(calUrl(calendarId, saida.gcal_event_id), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok || res.status === 404 || res.status === 410) {
          await supabase
            .from("producao_saidas")
            .update({ gcal_event_id: null, gcal_sync_status: "ok", gcal_synced_at: new Date().toISOString() })
            .eq("id", saida.id);
        }
      }
      return json({ ok: true });
    }

    // ---- upsert de uma saída ----
    async function upsertOne(saida: any) {
      // Cancelada → apaga o evento e zera o vínculo
      if (saida.status === "cancelada") {
        if (saida.gcal_event_id) {
          await fetch(calUrl(calendarId, saida.gcal_event_id), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
        await supabase
          .from("producao_saidas")
          .update({ gcal_event_id: null, gcal_sync_status: "ok", gcal_synced_at: new Date().toISOString() })
          .eq("id", saida.id);
        return { id: saida.id, eventId: null, status: "cancelada" };
      }

      const event = buildEvent(saida, membros);
      let eventId = saida.gcal_event_id as string | null;
      let ok = false;

      if (eventId) {
        const res = await fetch(calUrl(calendarId, eventId), {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify(event),
        });
        if (res.status === 404 || res.status === 410) {
          eventId = null; // evento sumiu no Google → recria
        } else {
          ok = res.ok;
        }
      }
      if (!eventId) {
        const res = await fetch(calUrl(calendarId), {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(event),
        });
        const data = await res.json();
        if (res.ok && data.id) {
          eventId = data.id;
          ok = true;
        } else {
          throw new Error("insert: " + JSON.stringify(data));
        }
      }

      await supabase
        .from("producao_saidas")
        .update({
          gcal_event_id: eventId,
          gcal_sync_status: ok ? "ok" : "erro",
          gcal_synced_at: new Date().toISOString(),
        })
        .eq("id", saida.id);

      return { id: saida.id, eventId, status: ok ? "ok" : "erro" };
    }

    if (action === "upsert") {
      const saida = await carregarSaida(body.saida_id);
      if (!saida) return json({ error: "saída não encontrada" }, 404);
      const r = await upsertOne(saida);
      return json({ ok: true, ...r });
    }

    // ---- sync_all: publica todas as saídas de hoje pra frente que faltam ----
    if (action === "sync_all") {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: pend } = await supabase
        .from("producao_saidas")
        .select("*, project:projects(name)")
        .gte("data", hoje)
        .order("data");
      const lista = (pend || []).map((s: any) => ({ ...s, project_name: s.project?.name || null }));
      let ok = 0;
      let erro = 0;
      for (const saida of lista) {
        try {
          await upsertOne(saida);
          ok++;
        } catch (e) {
          erro++;
          console.error("sync_all item", saida.id, e);
          await supabase
            .from("producao_saidas")
            .update({ gcal_sync_status: "erro", gcal_synced_at: new Date().toISOString() })
            .eq("id", saida.id);
        }
      }
      return json({ ok: true, sincronizadas: ok, erros: erro, total: lista.length });
    }

    return json({ error: "ação desconhecida: " + action }, 400);
  } catch (err) {
    console.error("gcal-sync error:", err);
    return json({ error: String(err) }, 500);
  }
});
