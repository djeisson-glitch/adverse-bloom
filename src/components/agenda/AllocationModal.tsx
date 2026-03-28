import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveJobAllocation, type JobAllocation } from "@/hooks/useJobAllocations";
import { useActiveTeamMembers } from "@/hooks/useTeamMembers";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allocation?: JobAllocation | null;
  defaultDate?: string;
}

export function AllocationModal({ open, onOpenChange, allocation, defaultDate }: Props) {
  const [budgetId, setBudgetId] = useState("");
  const [teamMemberId, setTeamMemberId] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [roleFunction, setRoleFunction] = useState("");

  const { data: members = [] } = useActiveTeamMembers();
  const save = useSaveJobAllocation();
  const { toast } = useToast();

  // Fetch approved budgets with capture_days > 0
  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets_with_capture_days"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budgets")
        .select("id, project_name, client_name, capture_days")
        .eq("status", "approved")
        .eq("is_latest_version", true)
        .order("project_name");
      if (error) throw error;
      return data as { id: string; project_name: string; client_name: string; capture_days: number }[];
    },
  });

  useEffect(() => {
    if (allocation) {
      setBudgetId(allocation.budget_id);
      setTeamMemberId(allocation.team_member_id);
      setDate(allocation.allocation_date);
      setStartTime(allocation.start_time || "");
      setEndTime(allocation.end_time || "");
      setLocation(allocation.location || "");
      setDescription(allocation.description || "");
      setRoleFunction(allocation.role_function || "");
    } else {
      setBudgetId("");
      setTeamMemberId("");
      setDate(defaultDate || "");
      setStartTime("08:00");
      setEndTime("18:00");
      setLocation("");
      setDescription("");
      setRoleFunction("");
    }
  }, [allocation, open, defaultDate]);

  const handleSave = () => {
    if (!budgetId || !teamMemberId || !date) return;
    save.mutate(
      {
        ...(allocation ? { id: allocation.id } : {}),
        budget_id: budgetId,
        team_member_id: teamMemberId,
        allocation_date: date,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location || null,
        description: description || null,
        role_function: roleFunction || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Alocação salva!" });
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{allocation ? "Editar Alocação" : "Nova Alocação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Job (Orçamento aprovado) *</Label>
            <Select value={budgetId} onValueChange={setBudgetId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione o job" />
              </SelectTrigger>
              <SelectContent>
                {budgets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.project_name} — {b.client_name} ({b.capture_days} diárias)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Membro da equipe *</Label>
            <Select value={teamMemberId} onValueChange={(v) => {
              setTeamMemberId(v);
              const m = members.find((m) => m.id === v);
              if (m?.role_function && !roleFunction) setRoleFunction(m.role_function);
            }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                      {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horário início</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horário fim</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Local</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Estúdio, cliente, externo..." className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Função neste job</Label>
            <Input value={roleFunction} onChange={(e) => setRoleFunction(e.target.value)} placeholder="Ex: Operador de câmera + Líder de set" className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição / O que precisa ser feito</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes da atividade..." rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!budgetId || !teamMemberId || !date || save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
