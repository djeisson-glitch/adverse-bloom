import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTimer } from "@/contexts/TimerContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, ListChecks, Info } from "lucide-react";
import { toast } from "sonner";

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string | null;
};

export function StartTimerModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const { start } = useTimer();
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState<string>("");
  const [description, setDescription] = useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ["timer-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client_name, status")
        .neq("status", "faturado")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Tarefas do projeto atribuídas ao próprio usuário — Djeisson pediu explícito
  // "aparece apenas as dela" pra evitar poluição do seletor.
  const { data: minhasTasks = [] } = useQuery({
    queryKey: ["timer-my-tasks", projectId, user?.id],
    enabled: !!projectId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("id, title, due_date, priority")
        .eq("project_id", projectId)
        .eq("assigned_user_id", user!.id)
        .eq("completed", false)
        .order("due_date", { nullsFirst: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const projeto = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const tarefa = useMemo(() => minhasTasks.find((t) => t.id === taskId), [minhasTasks, taskId]);

  const iniciar = () => {
    // Projeto é opcional — sem projeto = "atribuir depois" (padrão Catalunya)
    start({
      project_id: projeto?.id || null,
      project_name: projeto?.name || "sem projeto",
      task_id: tarefa?.id || null,
      task_title: tarefa?.title,
      description,
    });
    setProjectId("");
    setTaskId("");
    setDescription("");
    onOpenChange(false);
  };

  const close = () => {
    setProjectId("");
    setTaskId("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apontar horas</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Projeto</Label>
            <Select
              value={projectId}
              onValueChange={(v) => {
                setProjectId(v === "__none__" ? "" : v);
                setTaskId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="— sem projeto (atribuir depois) —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— sem projeto (atribuir depois) —</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.client_name || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {projectId && (
            <div>
              <Label className="flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5" />
                Suas tarefas neste projeto
              </Label>
              {minhasTasks.length === 0 ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3 w-3" />
                  Nenhuma tarefa atribuída a você aqui — o timer segue só no projeto.
                </p>
              ) : (
                <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/50 bg-muted/20 p-1">
                  {minhasTasks.map((t) => {
                    const selected = t.id === taskId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTaskId(selected ? "" : t.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                          selected
                            ? "bg-primary/15 text-primary"
                            : "text-foreground hover:bg-sidebar-accent/40"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {t.due_date && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(t.due_date).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          )}
                          {t.priority === "alta" && (
                            <span className="rounded bg-destructive/15 px-1 text-[10px] text-destructive">
                              alta
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <Label>O que vai fazer? (opcional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ex.: revisão do corte"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={iniciar} className="bg-primary text-primary-foreground">
            <Play className="mr-1 h-3.5 w-3.5 fill-current" />
            Iniciar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
