import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Plus, Trash2, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "sonner";
import { hojeISO } from "@/lib/dataLocal";

type Lanc = {
  id: string; data: string; descricao: string;
  valor: number; edicoes: number; diarias: number;
};

const VAZIO = { data: hojeISO(), descricao: "", valor: "", edicoes: "", diarias: "" };

/**
 * Saldo que o cliente tem A USAR — em R$, edições e diárias.
 *
 * É extrato, não campo. Um número solto ("3 edições") não responde de onde
 * veio: em três meses ninguém lembra se são do contrato de junho ou do
 * pacote de março, e o saldo vira discussão em vez de resposta.
 *
 * Positivo entra crédito, negativo consome. Saldo negativo aparece em
 * vermelho de propósito: quer dizer que o cliente consumiu além do
 * contratado, que é justamente a hora de conversar.
 *
 * Interno: não vai pro portal do cliente.
 */
const qtd = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "").replace(".", ","));

// Fora do componente pai de propósito: definida dentro, ela nasceria de novo
// a cada render e o React desmontaria a subárvore inteira. Ver a regra
// react/no-unstable-nested-components em eslint.hooks.config.js.
function Numero({ label, v, moeda }: { label: string; v: number; moeda?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${v < 0 ? "text-destructive" : v > 0 ? "text-success" : "text-muted-foreground"}`}>
        {moeda ? formatCurrency(v) : qtd(v)}
      </p>
    </div>
  );
}

export default function SaldoCliente({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const confirmar = useConfirm();
  const [abrir, setAbrir] = useState(false);
  const [novo, setNovo] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const { data: lancs = [] } = useQuery({
    queryKey: ["client_saldo", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("client_saldo_lancamentos").select("*")
        .eq("client_id", clientId).order("data", { ascending: false });
      return (data || []) as Lanc[];
    },
  });

  // Soma na tela em vez de ler a view: o total tem que bater com a lista que
  // está à vista, inclusive logo depois de apagar uma linha.
  const total = lancs.reduce(
    (s, l) => ({
      valor: s.valor + Number(l.valor || 0),
      edicoes: s.edicoes + Number(l.edicoes || 0),
      diarias: s.diarias + Number(l.diarias || 0),
    }),
    { valor: 0, edicoes: 0, diarias: 0 },
  );
  const temSaldo = total.valor !== 0 || total.edicoes !== 0 || total.diarias !== 0;

  const recarregar = () => qc.invalidateQueries({ queryKey: ["client_saldo", clientId] });

  const lancar = async () => {
    const v = Number(novo.valor) || 0, e = Number(novo.edicoes) || 0, d = Number(novo.diarias) || 0;
    if (!novo.descricao.trim()) return toast.error("Escreva de onde vem esse saldo");
    if (!v && !e && !d) return toast.error("Informe pelo menos um valor, edição ou diária");
    setSalvando(true);
    const { error } = await (supabase as any).from("client_saldo_lancamentos").insert({
      client_id: clientId, data: novo.data, descricao: novo.descricao.trim(),
      valor: v, edicoes: e, diarias: d, created_by: user?.id || null,
    });
    setSalvando(false);
    if (error) return toast.error("Não lançou", { description: error.message });
    setNovo({ ...VAZIO, data: novo.data });
    setAbrir(false);
    recarregar();
  };

  const apagar = async (l: Lanc) => {
    if (!(await confirmar({
      title: "Apagar este lançamento?",
      description: `“${l.descricao}” sai do extrato e o saldo é recalculado.`,
      confirmText: "Apagar", destructive: true,
    }))) return;
    // .select() porque o PostgREST devolve 204 mesmo quando a RLS barra tudo.
    const { data, error } = await (supabase as any)
      .from("client_saldo_lancamentos").delete().eq("id", l.id).select("id");
    if (error) return toast.error("Não apagou", { description: error.message });
    if (!data?.length) return toast.error("Nada foi apagado — você tem permissão pra mexer em dinheiro?");
    recarregar();
  };

  /** 7 vira "7", 0.5 vira "0,5" — meia diária é rotina, meia vírgula-zero-zero não. */

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">Saldo a usar</p>
              <p className="text-xs text-muted-foreground">
                O que este cliente ainda tem de crédito. Uso interno — não aparece no portal dele.
              </p>
            </div>
          </div>
          <Button size="sm" variant={abrir ? "ghost" : "outline"} onClick={() => setAbrir(!abrir)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> {abrir ? "Cancelar" : "Lançar"}
          </Button>
        </div>

        {temSaldo ? (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border/50 bg-muted/10 px-4 py-3">
            <Numero label="Valor" v={total.valor} moeda />
            <Numero label="Edições" v={total.edicoes} />
            <Numero label="Diárias" v={total.diarias} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border/50 px-4 py-3 text-xs text-muted-foreground">
            Sem saldo pendente. Lance aqui o que sobrou de um pacote, o que foi pré-pago, ou as
            diárias contratadas e ainda não usadas.
          </p>
        )}

        {abrir && (
          <div className="space-y-2 rounded-lg border border-border/50 p-3">
            <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
              <div className="space-y-1">
                <Label className="text-[11px]">Data</Label>
                <Input type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">De onde vem</Label>
                <Input
                  value={novo.descricao}
                  onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                  placeholder="Ex.: pacote de 10 edições contratado em março"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Valor (R$)</Label>
                <Input type="number" step="0.01" value={novo.valor} placeholder="0,00"
                  onChange={(e) => setNovo({ ...novo, valor: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Edições</Label>
                <Input type="number" step="0.5" value={novo.edicoes} placeholder="0"
                  onChange={(e) => setNovo({ ...novo, edicoes: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Diárias</Label>
                <Input type="number" step="0.5" value={novo.diarias} placeholder="0"
                  onChange={(e) => setNovo({ ...novo, diarias: e.target.value })} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Número <span className="text-success">positivo</span> entra saldo (contratou, pagou adiantado).
              {" "}<span className="text-destructive">Negativo</span> baixa (usou uma diária, gastou o crédito).
            </p>
            <Button size="sm" onClick={lancar} disabled={salvando}>Lançar</Button>
          </div>
        )}

        {/* Extrato: fechado quando é longo — o saldo é a resposta, a lista é
            a prova de onde ele veio. */}
        {lancs.length > 0 && (
          <details open={lancs.length <= 4}>
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-3 w-3" />
              {lancs.length} lançamento{lancs.length > 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-1">
              {lancs.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                    {l.data.slice(8, 10)}/{l.data.slice(5, 7)}/{l.data.slice(2, 4)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{l.descricao}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Number(l.valor) !== 0 && <b className={Number(l.valor) < 0 ? "text-destructive" : "text-success"}>{formatCurrency(Number(l.valor))}</b>}
                    {Number(l.edicoes) !== 0 && <span className="ml-2">{l.edicoes > 0 ? "+" : ""}{qtd(Number(l.edicoes))} ed</span>}
                    {Number(l.diarias) !== 0 && <span className="ml-2">{l.diarias > 0 ? "+" : ""}{qtd(Number(l.diarias))} di</span>}
                  </span>
                  <button onClick={() => apagar(l)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Apagar lançamento">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
