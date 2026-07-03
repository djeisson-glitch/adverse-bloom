import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTimer } from "@/contexts/TimerContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Info } from "lucide-react";

type DeliverableOpt = {
  id: string;
  titulo: string;
  formato: string | null;
  status: string | null;
  project: { id: string; name: string; numero: string | null; client_name: string | null; status: string | null } | null;
};

/**
 * Apontar horas — obriga escolher um ENTREGÁVEL (não o projeto, não "sem projeto").
 * Assim toda hora lançada fica presa a uma peça específica.
 */
export function StartTimerModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { start } = useTimer();
  const [deliverableId, setDeliverableId] = useState("");
  const [description, setDescription] = useState("");

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ["timer-deliverables"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, formato, status, project:projects(id, name, numero, client_name, status)")
        .order("titulo");
      if (error) throw error;
      // Só entregáveis de projetos ativos e ainda não entregues/aprovados.
      return (data as DeliverableOpt[]).filter(
        (d) =>
          d.project &&
          d.project.status !== "faturado" &&
          d.status !== "entregue" &&
          d.status !== "aprovado",
      );
    },
  });

  // Agrupa por projeto pra facilitar achar no seletor.
  const grupos = useMemo(() => {
    const m = new Map<string, { projeto: DeliverableOpt["project"]; itens: DeliverableOpt[] }>();
    deliverables.forEach((d) => {
      const key = d.project!.id;
      if (!m.has(key)) m.set(key, { projeto: d.project, itens: [] });
      m.get(key)!.itens.push(d);
    });
    return Array.from(m.values());
  }, [deliverables]);

  const entregavel = useMemo(
    () => deliverables.find((d) => d.id === deliverableId),
    [deliverables, deliverableId],
  );

  const iniciar = () => {
    if (!entregavel) return;
    start({
      project_id: entregavel.project?.id || null,
      project_name: entregavel.project?.name || "—",
      deliverable_id: entregavel.id,
      task_title: entregavel.titulo, // reaproveita o título no indicador do topo
      description,
    });
    reset();
    onOpenChange(false);
  };

  const reset = () => {
    setDeliverableId("");
    setDescription("");
  };
  const close = () => {
    reset();
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
            <Label>Entregável *</Label>
            <Select value={deliverableId} onValueChange={setDeliverableId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um entregável…" />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">Carregando…</div>
                ) : deliverables.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    Nenhum entregável ativo. Crie um entregável no projeto primeiro.
                  </div>
                ) : (
                  grupos.map((g) => (
                    <SelectGroup key={g.projeto!.id}>
                      <SelectLabel>
                        {g.projeto!.numero ? `${g.projeto!.numero} · ` : ""}
                        {g.projeto!.name}
                      </SelectLabel>
                      {g.itens.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.titulo}
                          {d.formato ? ` · ${d.formato}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3" />
              A hora fica presa ao entregável — nada de apontamento solto no projeto.
            </p>
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
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            onClick={iniciar}
            disabled={!deliverableId}
            className="bg-primary text-primary-foreground"
          >
            <Play className="mr-1 h-3.5 w-3.5 fill-current" />
            Iniciar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
