import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ListChecks, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Agrupamento = "pessoa" | "projeto";
type Periodo = "tudo" | "esta_semana" | "duas_semanas";
type StatusFiltro = "pendentes" | "todas";

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Pauta() {
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("pessoa");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [status, setStatus] = useState<StatusFiltro>("pendentes");
  const [pessoaFiltro, setPessoaFiltro] = useState<string>("__all__");
  const [projetoFiltro, setProjetoFiltro] = useState<string>("__all__");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const { data: tasks = [] } = useQuery({
    queryKey: ["pauta-tasks", periodo, status],
    queryFn: async () => {
      let q = (supabase as any)
        .from("tasks")
        .select("*, project:projects(id, name, client_name, status), assigned:profiles!tasks_assigned_user_id_fkey(id, full_name, email)")
        .not("project_id", "is", null);

      if (status === "pendentes") q = q.eq("completed", false);
      if (periodo === "esta_semana") {
        q = q.gte("due_date", iso(startOfWeek())).lte("due_date", iso(addDays(startOfWeek(), 6)));
      } else if (periodo === "duas_semanas") {
        q = q.gte("due_date", iso(startOfWeek())).lte("due_date", iso(addDays(startOfWeek(), 13)));
      }
      const { data, error } = await q.order("due_date", { nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["pauta-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["pauta-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .neq("status", "faturado")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtradas = useMemo(() => {
    let list = tasks;
    if (pessoaFiltro !== "__all__") {
      list = list.filter((t) => t.assigned_user_id === pessoaFiltro || (pessoaFiltro === "__sem__" && !t.assigned_user_id));
    }
    if (projetoFiltro !== "__all__") {
      list = list.filter((t) => t.project_id === projetoFiltro);
    }
    return list;
  }, [tasks, pessoaFiltro, projetoFiltro]);

  const grupos = useMemo(() => {
    const map = new Map<string, { label: string; sub?: string; items: any[] }>();
    filtradas.forEach((t) => {
      let key: string, label: string, sub: string | undefined;
      if (agrupamento === "pessoa") {
        key = t.assigned_user_id || "__sem__";
        label = t.assigned?.full_name || t.assigned?.email || "Sem responsável";
      } else {
        key = t.project_id;
        label = t.project?.name || "Projeto";
        sub = t.project?.client_name;
      }
      const g = map.get(key) || { label, sub, items: [] };
      g.items.push(t);
      map.set(key, g);
    });
    return Array.from(map.entries());
  }, [filtradas, agrupamento]);

  const toggle = (key: string) => {
    const s = new Set(expandidos);
    s.has(key) ? s.delete(key) : s.add(key);
    setExpandidos(s);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ListChecks className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Pauta da equipe</h1>
            <p className="text-sm text-muted-foreground">{filtradas.length} tarefas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={pessoaFiltro} onValueChange={setPessoaFiltro}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todas as pessoas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as pessoas</SelectItem>
              <SelectItem value="__sem__">Sem responsável</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projetoFiltro} onValueChange={setProjetoFiltro}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todos os projetos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os projetos</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-center gap-4 p-4 text-xs">
          <span className="font-semibold uppercase tracking-widest text-muted-foreground">Agrupar</span>
          <Segmented
            options={[
              { v: "pessoa", label: "Por pessoa" },
              { v: "projeto", label: "Por projeto" },
            ]}
            value={agrupamento}
            onChange={(v) => setAgrupamento(v as Agrupamento)}
          />
          <span className="ml-2 font-semibold uppercase tracking-widest text-muted-foreground">Período</span>
          <Segmented
            options={[
              { v: "tudo", label: "Tudo" },
              { v: "esta_semana", label: "Esta semana" },
              { v: "duas_semanas", label: "2 semanas" },
            ]}
            value={periodo}
            onChange={(v) => setPeriodo(v as Periodo)}
          />
          <span className="ml-2 font-semibold uppercase tracking-widest text-muted-foreground">Status</span>
          <Segmented
            options={[
              { v: "pendentes", label: "Pendentes" },
              { v: "todas", label: "Todas" },
            ]}
            value={status}
            onChange={(v) => setStatus(v as StatusFiltro)}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {grupos.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
              Nenhuma tarefa nos filtros escolhidos.
            </CardContent>
          </Card>
        ) : (
          grupos.map(([key, g]) => {
            const isOpen = expandidos.has(key);
            return (
              <Card key={key} className="glass-card">
                <CardContent className="p-0">
                  <button
                    onClick={() => toggle(key)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{g.label}</span>
                    {g.sub && <span className="text-xs text-muted-foreground">· {g.sub}</span>}
                    <span className="ml-auto rounded-md bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {g.items.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/40">
                      {g.items.map((t) => (
                        <Link
                          key={t.id}
                          to={t.project_id ? `/projetos/${t.project_id}` : "#"}
                          className="grid grid-cols-[1fr_140px_120px] items-center gap-3 border-b border-border/40 px-8 py-2 text-xs last:border-0 hover:bg-sidebar-accent/40"
                        >
                          <span className={`truncate ${t.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {t.title}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {agrupamento === "pessoa" ? t.project?.name : t.assigned?.full_name || "Sem responsável"}
                          </span>
                          <span className="text-right text-muted-foreground">
                            {t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR") : "sem prazo"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            value === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
