import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, CheckCircle } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useProfiles } from "@/hooks/useDeals";

interface Props {
  open: boolean;
  budgetName: string;
  totalValue: number;
  onConfirm: (opts: {
    createProject: boolean;
    projectName: string;
    startDate: string;
    deliveryDate: string;
    responsibleId: string;
  }) => void;
  onCancel: () => void;
}

export function ApprovalModal({ open, budgetName, totalValue, onConfirm, onCancel }: Props) {
  const { data: profiles = [] } = useProfiles();
  const [createProject, setCreateProject] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [deliveryDate, setDeliveryDate] = useState<Date>();
  const [responsibleId, setResponsibleId] = useState("");

  useEffect(() => {
    if (open) {
      setCreateProject(true);
      setProjectName(budgetName);
      setStartDate(new Date());
      setDeliveryDate(addDays(new Date(), 30));
      setResponsibleId(profiles[0]?.id || "");
    }
  }, [open, budgetName, profiles]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />
            Aprovar Orçamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirma a aprovação de <span className="text-foreground font-medium">{budgetName}</span>?
          </p>

          <div className="flex items-center gap-2">
            <Checkbox id="create-project" checked={createProject} onCheckedChange={(v) => setCreateProject(!!v)} />
            <Label htmlFor="create-project" className="text-sm cursor-pointer">Criar projeto vinculado</Label>
          </div>

          {createProject && (
            <div className="space-y-3 pl-6 border-l-2 border-primary/20">
              <div>
                <Label className="text-xs">Nome do projeto</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Data de início</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        {startDate ? format(startDate, "dd/MM/yyyy") : "Data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">Entrega prevista</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !deliveryDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        {deliveryDate ? format(deliveryDate, "dd/MM/yyyy") : "Data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={deliveryDate} onSelect={setDeliveryDate} locale={ptBR} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select value={responsibleId} onValueChange={setResponsibleId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => {
            onConfirm({
              createProject,
              projectName,
              startDate: startDate ? format(startDate, "yyyy-MM-dd") : "",
              deliveryDate: deliveryDate ? format(deliveryDate, "yyyy-MM-dd") : "",
              responsibleId,
            });
          }}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
