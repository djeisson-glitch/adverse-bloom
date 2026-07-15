import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeals, useClients } from "@/hooks/useDeals";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, History } from "lucide-react";

/**
 * Lançar histórico fechado: cria um negócio já GANHO/PERDIDO, com a DATA certa
 * (backdata created_at) — pro funil comercial não ficar todo carimbado "hoje".
 * Enxuto de propósito: pra registro comercial, não precisa refazer a planilha.
 */
export function HistoricoDealModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { clients, createClient } = useClients();
  const { createDeal } = useDeals();
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({ client_id: "", novo_cliente: "", title: "", valor: "", data: "", resultado: "ganho" });

  const reset = () => setF({ client_id: "", novo_cliente: "", title: "", valor: "", data: "", resultado: "ganho" });

  const salvar = async () => {
    if (!f.title.trim()) return toast.error("Informe o nome do projeto");
    if (!f.data) return toast.error("Informe a data (é o ponto do lançamento histórico)");
    if (!f.client_id && !f.novo_cliente.trim()) return toast.error("Escolha ou informe o cliente");
    setSalvando(true);
    try {
      let clientId = f.client_id;
      let clientName = clients.find((c: any) => c.id === clientId)?.name || null;
      if (!clientId && f.novo_cliente.trim()) {
        const novo = await createClient.mutateAsync({ name: f.novo_cliente.trim() } as any);
        clientId = novo.id; clientName = novo.name;
      }
      const ganho = f.resultado === "ganho";
      const valor = f.valor ? Number(f.valor) : 0;
      const quando = `${f.data}T12:00:00Z`;   // meio-dia evita virada de fuso
      await createDeal.mutateAsync({
        title: f.title.trim(),
        client_id: clientId || null,
        client_name: clientName,
        stage: ganho ? "fechado_ganho" : "perdido",
        value: valor,
        verba_estimada: valor || null,
        valor_proposta: valor || null,
        valor_final_aprovado: ganho ? valor : null,
        probability: ganho ? 100 : 0,
        created_at: quando,             // <<< backdata: é isto que o funil usa
        won_at: ganho ? quando : null,
        lost_at: ganho ? null : quando,
        created_by: user?.id || null,
      } as any);
      toast.success("Histórico lançado", { description: `${f.title.trim()} · ${ganho ? "ganho" : "perdido"}` });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Não salvou", { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Lançar histórico</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          Pra registrar um orçamento fechado de um tempo atrás com a <strong>data certa</strong>. Entra direto como ganho/perdido no funil.
        </p>

        <div className="space-y-3 py-1">
          <div>
            <Label>Cliente</Label>
            <Select value={f.client_id || "novo"} onValueChange={(v) => setF({ ...f, client_id: v === "novo" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="novo">— novo cliente —</SelectItem>
                {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!f.client_id && (
              <Input className="mt-2" placeholder="Nome do cliente novo" value={f.novo_cliente} onChange={(e) => setF({ ...f, novo_cliente: e.target.value })} />
            )}
          </div>

          <div>
            <Label>Nome do projeto</Label>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Vídeo institucional maio" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Resultado</Label>
            <Select value={f.resultado} onValueChange={(v) => setF({ ...f, resultado: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ganho">Fechado – Ganho</SelectItem>
                <SelectItem value="perdido">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-primary text-primary-foreground">
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Lançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
