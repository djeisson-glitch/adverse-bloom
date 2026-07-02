import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Table2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TASK_STATUSES } from "./ProjetoDetalhe";

/**
 * Controle de peças do projeto — padrão Catalunya (/jobs/:id/pecas).
 * As tarefas do projeto viram "peças" num grid com colunas específicas de
 * produtora: cartela, versão, vigência e locutor — editáveis direto na
 * célula. Horas vêm do apontamento.
 */
export default function ProjetoPecas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ["projeto", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, numero, name, client_name")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["projeto-pecas", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("*, assigned:profiles!tasks_assigned_user_id_fkey(full_name, email)")
        .eq("project_id", id!)
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  // Horas rastreadas por tarefa
  const { data: horasPorTask = {} } = useQuery({
    queryKey: ["projeto-pecas-horas", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_entries")
        .select("task_id, duration_min")
        .eq("project_id", id!)
        .not("task_id", "is", null);
      if (error) throw error;
      const m: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        m[e.task_id] = (m[e.task_id] || 0) + e.duration_min;
      });
      return m;
    },
  });

  const patch = async (taskId: string, updates: Record<string, any>) => {
    const { error } = await (supabase as any).from("tasks").update(updates).eq("id", taskId);
    if (error) toast.error("Erro", { description: error.message });
    else qc.invalidateQueries({ queryKey: ["projeto-pecas", id] });
  };

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-6">
      <button
        onClick={() => navigate(`/projetos/${id}`)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {project.name}
      </button>

      <div className="flex items-center gap-3">
        <Table2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Peças</h1>
          <p className="text-sm text-muted-foreground">
            {project.numero} · {project.client_name} · {tasks.length} peças
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="overflow-x-auto p-0">
          <div className="grid min-w-[1000px] grid-cols-[1.4fr_170px_120px_100px_120px_120px_70px_110px] gap-2 border-b border-border/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Peça</span>
            <span>Status</span>
            <span>Cartela</span>
            <span>Versão</span>
            <span>Vigência</span>
            <span>Locutor</span>
            <span className="text-right">Horas</span>
            <span>Resp.</span>
          </div>
          {tasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhuma peça — crie tarefas na ficha do projeto.
            </div>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className="grid min-w-[1000px] grid-cols-[1.4fr_170px_120px_100px_120px_120px_70px_110px] items-center gap-2 border-b border-border/30 px-4 py-1.5 last:border-0"
              >
                <span className="truncate text-sm text-foreground">{t.title}</span>
                <Select value={t.status || "aguardando_inicio"} onValueChange={(v) => patch(t.id, { status: v })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <CellInput valor={t.cartela} onSave={(v) => patch(t.id, { cartela: v || null })} />
                <CellInput valor={t.versao} onSave={(v) => patch(t.id, { versao: v || null })} />
                <CellInput valor={t.vigencia} onSave={(v) => patch(t.id, { vigencia: v || null })} />
                <CellInput valor={t.locutor} onSave={(v) => patch(t.id, { locutor: v || null })} />
                <span className="text-right text-xs text-muted-foreground">
                  {horasPorTask[t.id] ? `${(horasPorTask[t.id] / 60).toFixed(1)}h` : "—"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t.assigned?.full_name || "—"}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        controle de peças do projeto · edite cartela, versão, vigência e locutor direto na célula ·
        horas vêm do apontamento
      </p>
    </div>
  );
}

function CellInput({ valor, onSave }: { valor: string | null; onSave: (v: string) => void }) {
  return (
    <Input
      defaultValue={valor || ""}
      placeholder="—"
      onBlur={(e) => e.target.value !== (valor || "") && onSave(e.target.value)}
      className="h-7 border-transparent bg-transparent text-xs hover:border-border focus:border-border"
    />
  );
}
