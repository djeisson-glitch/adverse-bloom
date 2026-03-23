import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, XCircle } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  clientName?: string;
  profiles: Tables<"profiles">[];
  lossReasons: string[];
  followupDays?: number;
  onConfirm: (data: { reason: string; otherReason?: string; followup?: { title: string; dueDate: string; responsibleId: string } }) => void;
  onCancel: () => void;
}

export function LostReasonModal({ open, clientName, profiles, lossReasons, followupDays = 60, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [enableFollowup, setEnableFollowup] = useState(true);
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDate, setFollowupDate] = useState<Date>();
  const [followupResponsible, setFollowupResponsible] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setOtherReason("");
      setEnableFollowup(true);
      setFollowupTitle(`Recontato — ${clientName || "cliente"}`);
      setFollowupDate(addDays(new Date(), followupDays));
      setFollowupResponsible(profiles[0]?.id || "");
    }
  }, [open, clientName, followupDays, profiles]);

  const canSubmit = reason && (reason !== "Outro" || otherReason.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Mover para Perdido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Motivo da perda <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecionar motivo" /></SelectTrigger>
              <SelectContent>
                {lossReasons.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "Outro" && (
            <div>
              <Label>Especificar motivo</Label>
              <Input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Descreva o motivo..." />
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="lost-followup" checked={enableFollowup} onCheckedChange={(v) => setEnableFollowup(!!v)} />
              <Label htmlFor="lost-followup" className="text-sm font-medium cursor-pointer">Agendar follow-up de reaquecimento</Label>
            </div>

            {enableFollowup && (
              <div className="space-y-3 pl-6">
                <div>
                  <Label className="text-xs">Título</Label>
                  <Input value={followupTitle} onChange={(e) => setFollowupTitle(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Data</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !followupDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-1 h-3 w-3" />
                          {followupDate ? format(followupDate, "dd/MM/yyyy") : "Data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={followupDate} onSelect={setFollowupDate} locale={ptBR} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-xs">Responsável</Label>
                    <Select value={followupResponsible} onValueChange={setFollowupResponsible}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" disabled={!canSubmit} onClick={() => {
            onConfirm({
              reason: reason === "Outro" ? otherReason : reason,
              otherReason: reason === "Outro" ? otherReason : undefined,
              followup: enableFollowup && followupTitle ? {
                title: followupTitle,
                dueDate: followupDate ? format(followupDate, "yyyy-MM-dd") : "",
                responsibleId: followupResponsible,
              } : undefined,
            });
          }}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
