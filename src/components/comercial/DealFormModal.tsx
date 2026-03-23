import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { STAGES, type Deal } from "@/hooks/useDeals";
import { TaskList } from "./TaskList";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal?: Deal | null;
  clients: Tables<"clients">[];
  profiles: Tables<"profiles">[];
  onSave: (data: any) => void;
  onCreateClient: (name: string) => Promise<Tables<"clients">>;
  saving?: boolean;
}

export function DealFormModal({ open, onOpenChange, deal, clients, profiles, onSave, onCreateClient, saving }: Props) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [newClientName, setNewClientName] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [value, setValue] = useState("");
  const [stage, setStage] = useState("contato");
  const [probability, setProbability] = useState("50");
  const [closeDate, setCloseDate] = useState<Date>();
  const [notes, setNotes] = useState("");
  const [createdBy, setCreatedBy] = useState<string>("");

  useEffect(() => {
    if (deal) {
      setTitle(deal.title);
      setClientId(deal.client_id || "");
      setValue(String(deal.value || ""));
      setStage(deal.stage);
      setProbability(String(deal.probability || 50));
      setCloseDate(deal.expected_close_date ? new Date(deal.expected_close_date) : undefined);
      setNotes(deal.notes || "");
      setCreatedBy(deal.created_by || "");
    } else {
      setTitle("");
      setClientId("");
      setValue("");
      setStage("contato");
      setProbability("50");
      setCloseDate(undefined);
      setNotes("");
      setCreatedBy("");
      setShowNewClient(false);
      setNewClientName("");
    }
  }, [deal, open]);

  const handleSubmit = async () => {
    let finalClientId = clientId;

    if (showNewClient && newClientName.trim()) {
      const created = await onCreateClient(newClientName.trim());
      finalClientId = created.id;
    }

    onSave({
      title,
      client_id: finalClientId || null,
      value: parseFloat(value) || 0,
      stage,
      probability: parseInt(probability) || 50,
      expected_close_date: closeDate ? format(closeDate, "yyyy-MM-dd") : null,
      notes: notes || null,
      created_by: createdBy || null,
    });
  };

  const formContent = (
    <div className="space-y-4">
      <div>
        <Label>Título do deal</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Campanha institucional 2026" />
      </div>

      <div>
        <Label>Cliente</Label>
        {!showNewClient ? (
          <div className="flex gap-2">
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewClient(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Nome do novo cliente" className="flex-1" />
            <Button type="button" variant="ghost" size="sm" onClick={() => { setShowNewClient(false); setNewClientName(""); }}>Cancelar</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Valor estimado (R$)</Label>
          <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label>Estágio</Label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Probabilidade (%)</Label>
          <Input type="number" min="0" max="100" value={probability} onChange={(e) => setProbability(e.target.value)} />
        </div>
        <div>
          <Label>Data prevista de fechamento</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !closeDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {closeDate ? format(closeDate, "dd/MM/yyyy") : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={closeDate} onSelect={setCloseDate} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div>
        <Label>Responsável</Label>
        <Select value={createdBy} onValueChange={setCreatedBy}>
          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Observações</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas sobre o deal..." rows={3} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deal ? "Editar Deal" : "Novo Deal"}</DialogTitle>
        </DialogHeader>

        {deal ? (
          <Tabs defaultValue="detalhes">
            <TabsList className="w-full">
              <TabsTrigger value="detalhes" className="flex-1">Detalhes</TabsTrigger>
              <TabsTrigger value="tarefas" className="flex-1">Tarefas</TabsTrigger>
            </TabsList>
            <TabsContent value="detalhes">{formContent}</TabsContent>
            <TabsContent value="tarefas">
              <TaskList dealId={deal.id} clientId={deal.client_id} profiles={profiles} />
            </TabsContent>
          </Tabs>
        ) : (
          formContent
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || saving}>
            {saving ? "Salvando..." : deal ? "Salvar" : "Criar Deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
