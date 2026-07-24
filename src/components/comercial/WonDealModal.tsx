import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Trophy } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  dealTitle: string;
  clientName?: string;
  profiles: Tables<"profiles">[];
  followupDays?: number;
  onConfirm: (opts: { createBudget: boolean; createProject: boolean; followup?: { title: string; dueDate: string; responsibleId: string } }) => void;
  onCancel: () => void;
}

export function WonDealModal({ open, dealTitle, clientName, profiles, followupDays = 180, onConfirm, onCancel }: Props) {
  const [createBudget, setCreateBudget] = useState(true);
  const [createProject, setCreateProject] = useState(true);
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDate, setFollowupDate] = useState<Date>();
  const [followupResponsible, setFollowupResponsible] = useState("");
  const [enableFollowup, setEnableFollowup] = useState(true);

  useEffect(() => {
    if (open) {
      setCreateBudget(true);
      setCreateProject(true);
      setEnableFollowup(true);
      setFollowupTitle(`Follow-up pós-projeto — ${clientName || dealTitle}`);
      setFollowupDate(addDays(new Date(), followupDays));
      setFollowupResponsible(profiles[0]?.id || "");
    }
  }, [open, clientName, dealTitle, followupDays, profiles]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-success" />
            Fechar negócio?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Deal: <span className="text-foreground font-medium">{dealTitle}</span></p>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="create-budget" checked={createBudget} onCheckedChange={(v) => setCreateBudget(!!v)} />
              <Label htmlFor="create-budget" className="text-sm cursor-pointer">Criar orçamento vinculado</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="create-project" checked={createProject} onCheckedChange={(v) => setCreateProject(!!v)} />
              <Label htmlFor="create-project" className="text-sm cursor-pointer">Converter em projeto de Produção</Label>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="enable-followup" checked={enableFollowup} onCheckedChange={(v) => setEnableFollowup(!!v)} />
              <Label htmlFor="enable-followup" className="text-sm font-medium cursor-pointer">Agendar follow-up</Label>
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
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
            onConfirm({
              createBudget,
              createProject,
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
