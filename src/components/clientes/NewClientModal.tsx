import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClients } from "@/hooks/useDeals";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

const SEGMENTS = ["Tecnologia", "Saúde", "Educação", "Varejo", "Indústria", "Serviços", "Entretenimento", "Outro"];
const ORIGINS = ["Apollo", "Indicação", "Evento", "Conta Azul", "Outros"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export function NewClientModal({ open, onOpenChange, onCreated }: Props) {
  const { clients, createClient } = useClients();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", trade_name: "", company: "", contact_name: "", email: "", phone: "", segment: "", origin: "", notes: "" });
  const [forceCreate, setForceCreate] = useState(false);

  const similar = useMemo(() => {
    if (!form.name.trim() && !form.company.trim() && !form.email.trim()) return [];
    const matches: { id: string; name: string; company: string | null; matchField: string }[] = [];
    const nameQ = form.name.trim().toLowerCase();
    const companyQ = form.company.trim().toLowerCase();
    const emailQ = form.email.trim().toLowerCase();

    clients.forEach((c) => {
      if (nameQ && c.name.toLowerCase().includes(nameQ)) {
        matches.push({ id: c.id, name: c.name, company: c.company, matchField: "nome" });
      } else if (companyQ && c.company && c.company.toLowerCase().includes(companyQ)) {
        matches.push({ id: c.id, name: c.name, company: c.company, matchField: "empresa" });
      } else if (emailQ && c.email && c.email.toLowerCase() === emailQ) {
        matches.push({ id: c.id, name: c.name, company: c.company, matchField: "email" });
      }
    });
    return matches.slice(0, 3);
  }, [form.name, form.company, form.email, clients]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (similar.length > 0 && !forceCreate) {
      return; // show warning first
    }
    try {
      const result = await createClient.mutateAsync({
        name: form.name.trim(),
        trade_name: form.trade_name.trim() || null,
        company: form.company.trim() || null,
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        segment: form.segment || null,
        origin: form.origin || null,
        notes: form.notes.trim() || null,
      } as any);
      toast({ title: "Cliente criado!" });
      setForm({ name: "", trade_name: "", company: "", contact_name: "", email: "", phone: "", segment: "", origin: "", notes: "" });
      setForceCreate(false);
      onOpenChange(false);
      onCreated?.(result.id);
    } catch {
      toast({ title: "Erro ao criar cliente", variant: "destructive" });
    }
  };

  const handleUseExisting = (id: string) => {
    setForm({ name: "", trade_name: "", company: "", contact_name: "", email: "", phone: "", segment: "", origin: "", notes: "" });
    setForceCreate(false);
    onOpenChange(false);
    onCreated?.(id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setForceCreate(false); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Esta coluna se chamava "Razão Social" aqui e "Nome" na tela de
                detalhe — a MESMA coluna, com dois nomes. Agora é "Cliente" nos
                dois lugares, que é como ela aparece no resto do sistema. */}
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <Input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setForceCreate(false); }} placeholder="Razão social ou como é conhecido" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome Fantasia</Label>
              <Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} placeholder="Nome fantasia / apelido" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input value={form.company} onChange={(e) => { setForm({ ...form, company: e.target.value }); setForceCreate(false); }} placeholder="Só se a razão social for diferente" />
            </div>
            {/* A PESSOA não tinha campo em lugar nenhum, então acabava
                digitada em "Cliente" — e o cliente passava a se chamar pelo
                nome de quem atende. A carta já lia esta coluna (linha "A/C")
                e vinha sempre vazia. */}
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Quem assina e aprova" />
            </div>
          </div>

          {similar.length > 0 && !forceCreate && (
            <Alert variant="destructive" className="border-warning/50 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-sm">
                <p className="font-medium mb-2">Cliente(s) parecido(s) encontrado(s):</p>
                {similar.map((s) => (
                  <div key={s.id} className="flex items-center justify-between mb-1">
                    <span className="text-xs">
                      {s.name}{s.company ? ` — ${s.company}` : ""} <span className="text-muted-foreground">(por {s.matchField})</span>
                    </span>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleUseExisting(s.id)}>
                      Usar este
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="mt-2 w-full h-7 text-xs" onClick={() => setForceCreate(true)}>
                  Criar mesmo assim
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createClient.isPending || (similar.length > 0 && !forceCreate)}>
              {createClient.isPending ? "Criando..." : "Criar Cliente"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
