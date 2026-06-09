import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lista "Produção & Pós": cada card (tarefa top-level) = 1 projeto.
// Subtarefas = entregas, ignoradas. Configurável por env.
const LIST_PRODUCAO = Deno.env.get("CLICKUP_LIST_PRODUCAO") || "901320356772";

interface CUField {
  name: string;
  type: string;
  value?: any;
  type_config?: { options?: Array<{ id: string; orderindex: number; name: string }> };
}
interface CUTask {
  id: string;
  name: string;
  status?: { status?: string; type?: string };
  date_closed?: string | null;
  due_date?: string | null;
  date_created?: string | null;
  parent?: string | null;
  custom_fields?: CUField[];
}

const toISO = (ms?: string | null) => (ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null);

function getField(t: CUTask, name: string): CUField | undefined {
  return t.custom_fields?.find((f) => f.name === name);
}
// dropdown: o value é o orderindex (ou id) da opção; resolve pro nome
function resolveDropdown(f?: CUField): string | null {
  if (!f || f.value == null) return null;
  const opt = (f.type_config?.options || []).find(
    (o) => String(o.orderindex) === String(f.value) || o.id === f.value,
  );
  return opt?.name ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("CLICKUP_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "ClickUp não configurado (falta CLICKUP_API_TOKEN)." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pagina todas as tarefas (inclui concluídas), sem subtarefas.
    const tasks: CUTask[] = [];
    for (let page = 0; page < 30; page++) {
      const url = `https://api.clickup.com/api/v2/list/${LIST_PRODUCAO}/task?include_closed=true&subtasks=false&page=${page}`;
      const res = await fetch(url, { headers: { Authorization: token } });
      if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const batch = (data.tasks ?? []) as CUTask[];
      tasks.push(...batch);
      if (batch.length < 100) break; // última página
    }

    // Só cards de projeto (sem subtarefas). Cada um vira um "projeto".
    const projetos = tasks
      .filter((t) => !t.parent)
      .map((t) => {
        const valorF = getField(t, "Valor");
        const faturadoF = getField(t, "Faturado?");
        return {
          id: t.id,
          nome: t.name,
          concluido: t.status?.type === "closed" || t.status?.type === "done",
          status: t.status?.status ?? null,
          // data do projeto: conclusão se houver, senão vencimento, senão criação
          data: toISO(t.date_closed) || toISO(t.due_date) || toISO(t.date_created),
          cliente: resolveDropdown(getField(t, "Cliente")),
          valor: valorF?.value != null ? Number(valorF.value) : null,
          faturado: faturadoF?.value === true || faturadoF?.value === "true",
        };
      });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("clickup_cache").upsert(
      { data_type: "projetos_finalizados", payload: { itens: projetos }, fetched_at: new Date().toISOString() },
      { onConflict: "data_type" },
    );

    return new Response(JSON.stringify({
      ok: true,
      total: projetos.length,
      concluidos: projetos.filter((p) => p.concluido).length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("clickup-sync error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
