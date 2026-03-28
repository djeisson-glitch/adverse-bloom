import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) return null;
  return data;
}

async function getValidToken(supabase: any, teamMemberId: string): Promise<string | null> {
  const { data: tokenRow } = await supabase
    .from("google_tokens")
    .select("*")
    .eq("team_member_id", teamMemberId)
    .single();

  if (!tokenRow) return null;

  // Check if token is expired (with 5 min buffer)
  if (new Date(tokenRow.expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    if (!refreshed) return null;

    await supabase
      .from("google_tokens")
      .update({
        access_token: refreshed.access_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("team_member_id", teamMemberId);

    return refreshed.access_token;
  }

  return tokenRow.access_token;
}

async function createCalendarEvent(accessToken: string, event: any): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  const data = await res.json();
  return data.id || null;
}

async function updateCalendarEvent(accessToken: string, eventId: string, event: any): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  return res.ok;
}

async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok || res.status === 404;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, allocation_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (action === "delete") {
      // Get allocation to find event ID and team member
      const { data: alloc } = await supabase
        .from("job_allocations")
        .select("*, team_member:team_members(id, name)")
        .eq("id", allocation_id)
        .single();

      if (!alloc?.google_calendar_event_id) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const accessToken = await getValidToken(supabase, alloc.team_member_id);
      if (accessToken) {
        await deleteCalendarEvent(accessToken, alloc.google_calendar_event_id);
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // action === "upsert"
    const { data: alloc } = await supabase
      .from("job_allocations")
      .select("*, team_member:team_members(id, name, email), budget:budgets(id, project_name, client_name)")
      .eq("id", allocation_id)
      .single();

    if (!alloc) {
      return new Response(JSON.stringify({ error: "Allocation not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = await getValidToken(supabase, alloc.team_member_id);
    if (!accessToken) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_google_token" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build event
    const startDate = alloc.allocation_date;
    const startTime = alloc.start_time || "09:00:00";
    const endTime = alloc.end_time || "18:00:00";

    const summary = `📹 ${alloc.budget?.project_name || "Job"} — ${alloc.budget?.client_name || ""}`;
    const descriptionParts = [
      `Cliente: ${alloc.budget?.client_name || ""}`,
      `Projeto: ${alloc.budget?.project_name || ""}`,
      alloc.role_function ? `Função: ${alloc.role_function}` : "",
      alloc.description ? `\nDetalhes:\n${alloc.description}` : "",
    ].filter(Boolean);

    const event = {
      summary,
      description: descriptionParts.join("\n"),
      location: alloc.location || undefined,
      start: {
        dateTime: `${startDate}T${startTime}`,
        timeZone: "America/Sao_Paulo",
      },
      end: {
        dateTime: `${startDate}T${endTime}`,
        timeZone: "America/Sao_Paulo",
      },
      // No attendees — event appears directly, no invite sent
    };

    let eventId: string | null = null;

    if (alloc.google_calendar_event_id) {
      // Update existing event
      const ok = await updateCalendarEvent(accessToken, alloc.google_calendar_event_id, event);
      if (ok) eventId = alloc.google_calendar_event_id;
    } else {
      // Create new event
      eventId = await createCalendarEvent(accessToken, event);
    }

    if (eventId && eventId !== alloc.google_calendar_event_id) {
      await supabase
        .from("job_allocations")
        .update({ google_calendar_event_id: eventId })
        .eq("id", alloc.id);
    }

    return new Response(JSON.stringify({ ok: true, eventId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Calendar sync error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
