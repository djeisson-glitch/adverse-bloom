import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Merge, AlertTriangle } from "lucide-react";

type ClienteSimples = { id: string; name: string; trade_name?: string | null };

const rotulo = (c: ClienteSimples) => c.trade_name || c.name;

/**
 * Unifica cliente duplicado: TUDO que aponta pro duplicado (projetos,
 * orçamentos, faturas, contratos, entregáveis, tarefas…) passa pro cliente
 * escolhido, e o duplicado é apagado. Quem faz o trabalho é a função
 * unificar_clientes no banco, numa transação só — não dá pra ficar pela metade.
 */
export function UnificarClienteDialog({
  duplicado, clientes, onClose, onDone,
}: {
  duplicado: ClienteSimples | null;
  clientes: ClienteSimples[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [manterId, setManterId] = useState("");
  const [rodando, setRodando] = useState(false);

  const opcoes = clientes.filter((c) => c.id !== duplicado?.id);
  const manter = opcoes.find((c) => c.id === manterId);

  const unificar = async () => {
    if (!duplicado || !manterId) return;
    setRodando(true);
    try {
      const { data, error } = await (supabase as any).rpc("unificar_clientes", {
        _manter: manterId,
        _remover: duplicado.id,
      });
      if (error) throw error;
      const movidos = (data?.movidos || {}) as Record<string, number>;
      const resumo = Object.entries(movidos).map(([t, n]) => `${n} em ${t}`).join(", ");
      toast.success(`Unificado em "${data?.mantido}"`, {
        description: resumo ? `Movido: ${resumo}.` : "Não havia nada ligado ao duplicado.",
      });
      setManterId("");
      onDone();
      onClose();
    } catch (e: any) {
      toast.error("Não deu pra unificar", { description: e.message });
    } finally {
      setRodando(false);
    }
  };

  return (
    <Dialog open={!!duplicado} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-4 w-4 text-primary" /> Unificar cliente duplicado
          </DialogTitle>
          <DialogDescription>
            <b className="text-foreground">{duplicado ? rotulo(duplicado) : ""}</b> será removido, e
            tudo que está ligado a ele (projetos, orçamentos, faturas, entregáveis, tarefas…)
            passa para o cliente que você escolher abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Manter este cliente:</p>
          <Select value={manterId} onValueChange={setManterId}>
            <SelectTrigger><SelectValue placeholder="Escolha o cliente que fica" /></SelectTrigger>
            <SelectContent>
              {opcoes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{rotulo(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {manter && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Não dá pra desfazer. Depois disso vai existir só <b>{rotulo(manter)}</b>.
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={rodando}>Cancelar</Button>
          <Button
            onClick={unificar}
            disabled={!manterId || rodando}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {rodando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Unificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
