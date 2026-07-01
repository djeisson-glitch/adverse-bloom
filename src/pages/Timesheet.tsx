import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarCheck, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Entry = {
  id: string;
  user_id: string;
  project_id: string;
  start_at: string;
  duration_min: number;
  source: string;
};

function startOfWeek(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtDay(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export default function Timesheet() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [addingProject, setAddingProject] = useState("");
  const [extraProjects, setExtraProjects] = useState<string[]>([]);

  const dias = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();

  const { data: entries = [] } = useQuery({
    queryKey: ["ts-entries", user?.id, from, to],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_entries")
        .select("id, user_id, project_id, start_at, duration_min, source")
        .eq("user_id", user!.id)
        .gte("start_at", from)
        .lt("start_at", to);
      if (error) throw error;
      return data as Entry[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["ts-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client_name")
        .neq("status", "faturado")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Matriz projeto × dia (min)
  const matriz = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    entries.forEach((e) => {
      const day = iso(new Date(e.start_at));
      const row = m.get(e.project_id) || new Map();
      row.set(day, (row.get(day) || 0) + e.duration_min);
      m.set(e.project_id, row);
    });
    return m;
  }, [entries]);

  const projectIdsInMatriz = Array.from(matriz.keys());
  const projectIds = Array.from(new Set([...projectIdsInMatriz, ...extraProjects]));
  const projectsMap = new Map(projects.map((p) => [p.id, p]));

  const totalDia = (d: Date) => {
    let sum = 0;
    matriz.forEach((row) => (sum += row.get(iso(d)) || 0));
    return sum / 60;
  };
  const totalSemana = Array.from(matriz.values()).reduce(
    (sum, row) => sum + Array.from(row.values()).reduce((s, v) => s + v, 0),
    0,
  ) / 60;
  const meta = 40;
  const faltam = Math.max(0, meta - totalSemana);

  const setCell = async (projectId: string, day: Date, horasStr: string) => {
    if (!user) return;
    const horas = Number(horasStr.replace(",", "."));
    if (Number.isNaN(horas) || horas < 0) return;
    const dayISO = iso(day);
    const start = new Date(`${dayISO}T09:00:00`);

    // Remove existentes desse dia+projeto criadas via timesheet (source=timesheet)
    const { data: existentes } = await (supabase as any)
      .from("time_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .gte("start_at", dayISO)
      .lt("start_at", iso(addDays(day, 1)))
      .eq("source", "timesheet");
    if (existentes && existentes.length > 0) {
      await (supabase as any).from("time_entries").delete().in(
        "id",
        existentes.map((r: any) => r.id),
      );
    }

    if (horas > 0) {
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: user.id,
        project_id: projectId,
        start_at: start.toISOString(),
        duration_min: Math.round(horas * 60),
        billable: true,
        source: "timesheet",
      });
      if (error) return toast.error("Erro ao salvar", { description: error.message });
    }
    qc.invalidateQueries({ queryKey: ["ts-entries"] });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <CalendarCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Timesheet</h1>
          <p className="text-sm text-muted-foreground">Grid semanal projeto × dia. Digite as horas na célula e pressione Enter.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-sm font-medium text-foreground">
          {weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} –{" "}
          {addDays(weekStart, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
        </span>
        <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          Esta semana
        </Button>
        <Button size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <span className="ml-auto text-sm">
          Semana: <strong>{totalSemana.toFixed(1)}h</strong> de {meta}h ·{" "}
          {faltam > 0 ? (
            <span className="text-warning">(faltam {faltam.toFixed(1)}h)</span>
          ) : (
            <span className="text-success">meta ok</span>
          )}
        </span>
      </div>

      <Card className="glass-card">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Projeto
                </th>
                {dias.map((d) => (
                  <th key={d.toISOString()} className="px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {fmtDay(d)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {projectIds.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Adicione um projeto abaixo e preencha as horas do seu dia.
                  </td>
                </tr>
              ) : (
                projectIds.map((pid) => {
                  const p = projectsMap.get(pid);
                  const totalRow = dias.reduce((s, d) => s + (matriz.get(pid)?.get(iso(d)) || 0), 0) / 60;
                  return (
                    <tr key={pid} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2 text-sm text-foreground">{p?.name || "—"}</td>
                      {dias.map((d) => {
                        const val = (matriz.get(pid)?.get(iso(d)) || 0) / 60;
                        return (
                          <td key={d.toISOString()} className="px-1 py-1 text-center">
                            <input
                              type="text"
                              defaultValue={val > 0 ? val.toString() : ""}
                              onBlur={(e) => setCell(pid, d, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              placeholder="·"
                              className="w-14 rounded border border-border/40 bg-muted/20 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right text-sm text-primary">{totalRow.toFixed(1)}h</td>
                    </tr>
                  );
                })
              )}
              <tr className="border-t border-border/50 bg-muted/20">
                <td className="px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Total do dia
                </td>
                {dias.map((d) => {
                  const t = totalDia(d);
                  const over = t > 8;
                  return (
                    <td key={d.toISOString()} className={`px-1 py-2 text-center text-xs font-medium ${over ? "text-destructive" : "text-foreground"}`}>
                      {t > 0 ? t.toFixed(1) : "·"}
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right text-sm font-semibold text-primary">{totalSemana.toFixed(1)}h</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Adicionar projeto à semana:</span>
        <Select value={addingProject} onValueChange={setAddingProject}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="— selecione —" />
          </SelectTrigger>
          <SelectContent>
            {projects
              .filter((p) => !projectIds.includes(p.id))
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() => {
            if (!addingProject) return;
            setExtraProjects([...extraProjects, addingProject]);
            setAddingProject("");
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Digite as horas direto na célula (projeto × dia) e pressione Enter. O total do dia fica vermelho se passar de 8h.
        Ao salvar, criamos uma <em>time entry</em> sintética com <code>source=timesheet</code> — para não conflitar com o timer manual.
      </p>
    </div>
  );
}
