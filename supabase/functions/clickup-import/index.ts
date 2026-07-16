import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =========================================================================
// Importa os projetos de 2026 do ClickUp para `projects` — COM REVERSÃO.
//
//  • Fonte dos dados: body.tasks (payload coletado via conector) OU a API do
//    ClickUp direto (se CLICKUP_API_TOKEN estiver válido).
//  • Idempotente: dedup por clickup_task_id.
//  • Cria clientes que faltam (casando por nome, case-insensitive).
//  • NÃO importa dinheiro — só nome/status/data/cliente.
//  • dryRun é o PADRÃO. Pra gravar: { confirm: true } → grava e registra o run
//    em import_runs (ids exatos criados) e devolve run_id.
//  • Reverter: { reverter: "<run_id>" } → apaga exatamente o que aquele run
//    criou (projetos; clientes só se não estiverem em uso) e marca revertido.
// =========================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LIST_PRODUCAO = Deno.env.get("CLICKUP_LIST_PRODUCAO") || "901320356772";

interface TaskIn {
  id: string; name: string; status?: string | null; cliente?: string | null;
  due_date?: string | null; date_closed?: string | null; name_date?: string | null; date_created?: string | null;
}

const toISO = (ms?: string | null) => (ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null);
const isDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const yearOf = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : null);

function mapStatus(s: string | null | undefined): string {
  const k = (s || "").toLowerCase();
  if (k.includes("brief")) return "briefing";
  if (k.includes("pré") || k.includes("pre-")) return "pre-producao";
  if (k.includes("aguardando cliente") || k.includes("revis") || k.includes("cliente")) return "revisao";
  if (k.includes("final") || k.includes("entreg") || k.includes("conclu")) return "entregue";
  if (k.includes("pós") || k.includes("pos-") || k.includes("produ")) return "producao";
  return "producao";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---------------- REVERTER ----------------
    if (body?.reverter) {
      const { data: run, error: eRun } = await admin.from("import_runs").select("*").eq("id", body.reverter).maybeSingle();
      if (eRun || !run) return json({ error: "Run não encontrado" }, 404);
      if (run.revertido_em) return json({ error: `Run já revertido em ${run.revertido_em}` }, 400);

      const projIds: string[] = run.payload?.project_ids || [];
      const cliIds: string[] = run.payload?.client_ids || [];
      let projApagados = 0; const projFalhas: string[] = [];
      for (const id of projIds) {
        const { error } = await admin.from("projects").delete().eq("id", id);
        if (error) projFalhas.push(`${id}: ${error.message}`); else projApagados++;
      }
      let cliApagados = 0; const cliMantidos: string[] = [];
      for (const id of cliIds) {
        const { count: nproj } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("client_id", id);
        const { count: ndeal } = await admin.from("deals").select("id", { count: "exact", head: true }).eq("client_id", id);
        if ((nproj || 0) === 0 && (ndeal || 0) === 0) {
          const { error } = await admin.from("clients").delete().eq("id", id);
          if (!error) { cliApagados++; continue; }
        }
        cliMantidos.push(id);
      }
      await admin.from("import_runs").update({ revertido_em: new Date().toISOString() }).eq("id", run.id);
      return json({ modo: "revertido", projetos_apagados: projApagados, projetos_falha: projFalhas, clientes_apagados: cliApagados, clientes_mantidos_em_uso: cliMantidos.length });
    }

    // ---------------- IMPORTAR ----------------
    const confirm = body?.confirm === true;
    const ano = Number(body?.ano) || 2026;

    // Fonte: payload OU API do ClickUp
    let tasks: TaskIn[] = [];
    if (Array.isArray(body?.tasks) && body.tasks.length > 0) {
      tasks = body.tasks as TaskIn[];
    } else {
      const token = Deno.env.get("CLICKUP_API_TOKEN");
      if (!token) return json({ error: "Sem payload e sem CLICKUP_API_TOKEN." }, 503);
      for (let page = 0; page < 40; page++) {
        const url = `https://api.clickup.com/api/v2/list/${LIST_PRODUCAO}/task?include_closed=true&subtasks=false&page=${page}`;
        const res = await fetch(url, { headers: { Authorization: token } });
        if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const batch = (data.tasks ?? []) as any[];
        tasks.push(...batch.filter((t) => !t.parent).map((t) => ({
          id: t.id, name: t.name, status: t.status?.status ?? null,
          due_date: toISO(t.due_date), date_closed: toISO(t.date_closed), date_created: toISO(t.date_created),
          cliente: null,
        })));
        if (batch.length < 100) break;
      }
    }

    // Mapeia -> linha de projeto; filtra o ano.
    const mapped = tasks
      .map((t) => {
        const dataRef = [t.date_closed, t.due_date, t.name_date, t.date_created].find(isDate) || null;
        return {
          clickup_task_id: t.id,
          name: (t.name || "").trim() || "(sem nome)",
          status: mapStatus(t.status),
          cliente: (t.cliente || "").trim() || null,
          sold_date: dataRef,
          delivery_date: isDate(t.due_date) ? t.due_date : null,
          start_date: [t.name_date, t.date_created].find(isDate) || dataRef,
        };
      })
      .filter((p) => yearOf(p.sold_date) === ano);

    // Dedup contra o que já existe.
    const { data: existentes } = await admin.from("projects").select("clickup_task_id").not("clickup_task_id", "is", null);
    const ja = new Set((existentes || []).map((r: any) => r.clickup_task_id));
    const novos = mapped.filter((p) => !ja.has(p.clickup_task_id));

    // Clientes: casa por nome; separa os que faltam.
    const { data: clientesExist } = await admin.from("clients").select("id, name");
    const mapa = new Map<string, string>();
    (clientesExist || []).forEach((c: any) => c.name && mapa.set(c.name.trim().toLowerCase(), c.id));
    const nomesNovos = [...new Set(novos.map((p) => p.cliente).filter((n): n is string => !!n && !mapa.has(n.trim().toLowerCase())))];

    if (!confirm) {
      const porStatus: Record<string, number> = {}; const porCliente: Record<string, number> = {};
      novos.forEach((p) => {
        porStatus[p.status] = (porStatus[p.status] || 0) + 1;
        porCliente[p.cliente || "(sem cliente)"] = (porCliente[p.cliente || "(sem cliente)"] || 0) + 1;
      });
      return json({
        modo: "dry-run (nada gravado)", ano,
        cards_do_ano: mapped.length, ja_importados: mapped.length - novos.length, vao_ser_criados: novos.length,
        por_status: porStatus, por_cliente: porCliente, clientes_a_criar: nomesNovos,
        amostra: novos.slice(0, 5).map((p) => ({ nome: p.name, cliente: p.cliente, status: p.status, data: p.sold_date })),
        como_gravar: 'reenvie com {"confirm": true}',
      });
    }

    // ---- GRAVA (registrando tudo pro revert) ----
    const clientIdsCriados: string[] = [];
    if (nomesNovos.length) {
      const { data: criados, error: eCli } = await admin.from("clients").insert(nomesNovos.map((name) => ({ name }))).select("id, name");
      if (eCli) throw new Error(`Falha ao criar clientes: ${eCli.message}`);
      (criados || []).forEach((c: any) => { mapa.set(c.name.trim().toLowerCase(), c.id); clientIdsCriados.push(c.id); });
    }

    const rows = novos.map((p) => ({
      name: p.name, status: p.status,
      client_id: p.cliente ? mapa.get(p.cliente.trim().toLowerCase()) || null : null,
      client_name: p.cliente || "",
      sold_date: p.sold_date, delivery_date: p.delivery_date, start_date: p.start_date,
      created_at: p.sold_date ? `${p.sold_date}T12:00:00Z` : undefined,   // data histórica de verdade
      clickup_task_id: p.clickup_task_id,
    }));

    const projectIds: string[] = [];
    let falhaLote: string | null = null;
    for (let i = 0; i < rows.length; i += 100) {
      const { data: ins, error: ePrj } = await admin.from("projects").insert(rows.slice(i, i + 100)).select("id");
      if (ePrj) { falhaLote = `lote ${i}: ${ePrj.message}`; break; }
      (ins || []).forEach((r: any) => projectIds.push(r.id));
    }

    // Registra o run SEMPRE que algo foi criado — falha parcial também é reversível.
    if (falhaLote && projectIds.length === 0 && clientIdsCriados.length === 0) {
      return json({ error: `Falha sem nada criado (${falhaLote})` }, 500);
    }

    const resumo = { projetos_criados: projectIds.length, clientes_criados: clientIdsCriados.length, ja_existiam: mapped.length - novos.length, ano };
    const { data: run } = await admin.from("import_runs")
      .insert({ tipo: "clickup-projetos", payload: { project_ids: projectIds, client_ids: clientIdsCriados }, resumo })
      .select("id").single();

    if (falhaLote) {
      return json({
        modo: "parcial", erro: falhaLote, run_id: run?.id, ...resumo,
        como_reverter: `reenvie com {"reverter": "${run?.id}"}`,
      }, 500);
    }
    return json({ modo: "gravado", run_id: run?.id, ...resumo, como_reverter: `reenvie com {"reverter": "${run?.id}"}` });
  } catch (e) {
    console.error("clickup-import error:", e);
    return json({ error: String(e) }, 500);
  }
});
