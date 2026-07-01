import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTimer } from "@/contexts/TimerContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play } from "lucide-react";
import { toast } from "sonner";

export function StartTimerModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { start } = useTimer();
  const [projectId, setProjectId] = useState("");
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

  const iniciar = () => {
    const p = projects.find((x) => x.id === projectId);
    if (!p) return toast.error("Escolha um projeto");
    start({ project_id: p.id, project_name: p.name, description });
    setProjectId("");
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
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="— selecione —" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.client_name || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
