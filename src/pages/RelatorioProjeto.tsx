import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ArrowLeft, Loader2, BarChart3, Clock, Users, ListChecks, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

/**
 * Relatório do projeto — horas mapeadas por pessoa e por tarefa.
 * Padrão Catalunya (/relatorios/projeto/:id).
 */
export default function RelatorioProjeto() {
  const { id } = useParams<{ id: string }>();
  const { canSeeMoney } = usePermissions();

  const { data: project, isLoading } = useQuery({
    queryKey: ["projeto", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, numero, name, client_name, status, sold_value")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["rel-projeto-entries", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_entries")
        .select("user_id, task_id, duration_min, billable, pessoa:profiles(full_name, email), task:tasks(title)")
        .eq("project_id", id!);
      if (error) throw error;
      return data as any[];
    },
  });

  const stats = useMemo(() => {
    const totalMin = entries.reduce((s, e) => s + e.duration_min, 0);
    const billableMin = entries.filter((e) => e.billable).reduce((s, e) => s + e.duration_min, 0);
    const pessoas = new Set(entries.map((e) => e.user_id)).size;
    const tarefas = new Set(entries.filter((e) => e.task_id).map((e) => e.task_id)).size;
    return { horas: totalMin / 60, faturaveis: billableMin / 60, pessoas, tarefas };
  }, [entries]);

  const porPessoa = useMemo(() => {
    const m = new Map<string, { nome: string; min: number }>();
    entries.forEach((e) => {
      const nome = e.pessoa?.full_name || e.pessoa?.email || "?";
      const cur = m.get(e.user_id) || { nome, min: 0 };
      cur.min += e.duration_min;
      m.set(e.user_id, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.min - a.min);
  }, [entries]);

  const porTarefa = useMemo(() => {
    const m = new Map<string, { titulo: string; min: number }>();
    entries.forEach((e) => {
      const key = e.task_id || "__sem__";
      const titulo = e.task?.title || "Sem tarefa (projeto geral)";
      const cur = m.get(key) || { titulo, min: 0 };
      cur.min += e.duration_min;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.min - a.min);
  }, [entries]);

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const maxPessoa = Math.max(1, ...porPessoa.map((p) => p.min));
  const maxTarefa = Math.max(1, ...porTarefa.map((t) => t.min));

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <Link
        to={`/projetos/${id}`}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        abrir projeto
      </Link>

      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <p className="font-mono text-xs text-muted-foreground">
            {project.numero} · {project.status}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.client_name}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi icon={Clock} label="Horas mapeadas" value={`${stats.horas.toFixed(1)}h`} hint={`${stats.faturaveis.toFixed(1)}h faturável`} />
        <Kpi icon={Users} label="Pessoas" value={String(stats.pessoas)} hint="trackearam" />
        <Kpi icon={ListChecks} label="Tarefas" value={String(stats.tarefas)} hint="com horas" />
        <Kpi
          icon={Coins}
          label="Valor"
          value={canSeeMoney ? formatCurrency(project.sold_value || 0) : "—"}
          hint="defina o custo/hora p/ margem"
        />
      </div>

      {entries.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhuma hora apontada neste projeto ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="glass-card">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-medium text-foreground">Por pessoa</p>
              {porPessoa.map((p) => (
                <div key={p.nome} className="flex items-center gap-2">
                  <span className="w-32 truncate text-xs text-muted-foreground">{p.nome}</span>
                  <div className="relative h-4 flex-1 rounded bg-muted/40">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-primary/70"
                      style={{ width: `${(p.min / maxPessoa) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs">{(p.min / 60).toFixed(1)}h</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-medium text-foreground">Por tarefa</p>
              {porTarefa.map((t) => (
                <div key={t.titulo} className="flex items-center gap-2">
                  <span className="w-32 truncate text-xs text-muted-foreground">{t.titulo}</span>
                  <div className="relative h-4 flex-1 rounded bg-muted/40">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-warning/70"
                      style={{ width: `${(t.min / maxTarefa) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs">{(t.min / 60).toFixed(1)}h</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="space-y-1 p-4">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
