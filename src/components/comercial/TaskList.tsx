import { useState } from "react";
import { Plus, CheckCircle2, Circle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTasks } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  dealId: string;
  clientId?: string | null;
  profiles: Tables<"profiles">[];
}

export function TaskList({ dealId, clientId, profiles }: Props) {
  const { tasks, createTask, updateTask } = useTasks(dealId);
  const { user } = useAuth();
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState<Date>();
  const [newResponsible, setNewResponsible] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await createTask.mutateAsync({
      deal_id: dealId,
      client_id: clientId || null,
      title: newTitle.trim(),
      due_date: newDueDate ? format(newDueDate, "yyyy-MM-dd") : null,
      created_by: newResponsible || user?.id || null,
    });
    setNewTitle("");
    setNewDueDate(undefined);
    setNewResponsible("");
    setAdding(false);
  };

  const toggleComplete = (task: typeof tasks[0]) => {
    updateTask.mutate({
      id: task.id,
      completed: !task.completed,
      completed_at: !task.completed ? new Date().toISOString() : null,
    });
  };

  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Tarefas ({pending.length} pendentes)</h4>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)} className="text-xs">
          <Plus className="h-3 w-3 mr-1" /> Nova Tarefa
        </Button>
      </div>

      {adding && (
        <div className="space-y-2 p-3 rounded-md border border-border bg-background">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título da tarefa" autoFocus />
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left font-normal text-xs", !newDueDate && "text-muted-foreground")}>
                  <CalendarDays className="mr-1 h-3 w-3" />
                  {newDueDate ? format(newDueDate, "dd/MM/yyyy") : "Data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={newDueDate} onSelect={setNewDueDate} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Select value={newResponsible} onValueChange={setNewResponsible}>
              <SelectTrigger className="flex-1 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={!newTitle.trim()}>Adicionar</Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {pending.map((task) => (
          <div key={task.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 cursor-pointer group" onClick={() => toggleComplete(task)}>
            <Circle className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
            <span className="text-sm flex-1 truncate">{task.title}</span>
            {task.due_date && (
              <span className={cn("text-[11px] shrink-0", new Date(task.due_date) < new Date() ? "text-destructive" : "text-muted-foreground")}>
                {format(new Date(task.due_date), "dd/MM")}
              </span>
            )}
          </div>
        ))}
        {completed.map((task) => (
          <div key={task.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 cursor-pointer opacity-50" onClick={() => toggleComplete(task)}>
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm flex-1 truncate line-through">{task.title}</span>
          </div>
        ))}
      </div>

      {tasks.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tarefa ainda</p>
      )}
    </div>
  );
}
