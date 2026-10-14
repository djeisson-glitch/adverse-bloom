import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { numeroOrcamento, linkOrcamento, referenciasOrcamentos, type OrcamentoFechamento, type OrcamentoMensalRef } from "@/lib/orcamentosFechamento";

export function OrcamentosFechamento({ id, rows, mensal }: { id: string; rows?: OrcamentoFechamento[]; mensal?: OrcamentoMensalRef; fechado?: boolean }) {
  const qc = useQueryClient();
  const preparar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("preparar_orcamentos_fechamento", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["faturamento_mensal"] }); toast.success("Referências atualizadas"); },
    onError: (e: Error) => toast.error("Não foi possível preparar os orçamentos", { description: e.message }),
  });
  const copiar = async (balde: string) => {
    try { await navigator.clipboard.writeText(`${mensal && balde === "mensal" ? "Orçamento" : "Orçamentos"}: ${mensal && balde === "mensal" ? numeroOrcamento(mensal.orcamento_numero) : referenciasOrcamentos(rows || [], balde)}`); toast.success("Referência copiada"); }
    catch { toast.error("Não foi possível copiar. Selecione os números abaixo."); }
  };
  return <section className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-2 font-semibold text-sm"><FileText className="h-4 w-4 text-primary" /> {mensal ? "Orçamento do mês" : "Referências do fechamento"}</h3>
        <p className="text-xs text-muted-foreground mt-1">{mensal?.historico ? "Controle consolidado do mês já faturado." : "Referência para nota fiscal, boleto e Conta Azul."}</p></div>
      {!mensal && <Button size="sm" onClick={() => preparar.mutate()} disabled={preparar.isPending}>Consolidar orçamento do mês</Button>}
    </div>
    {mensal && <div className="flex flex-wrap items-center justify-between gap-3">
      <Link className="font-semibold text-primary hover:underline" to={`/orcamentos-mensais/${mensal.budget_id}`}>
        {numeroOrcamento(mensal.orcamento_numero)} · Ver projetos e rentabilidade →
      </Link>
      <Button size="sm" variant="outline" onClick={() => copiar("mensal")}><Copy className="h-3 w-3 mr-2" /> Copiar número</Button>
    </div>}
    {mensal?.historico && <details className="text-xs text-muted-foreground border-t border-border/50 pt-3">
      <summary className="cursor-pointer hover:text-foreground">Referências da emissão original</summary>
      <p className="mt-2 mb-1">As notas já emitidas mantêm os números anteriores.</p>
      {(rows || []).filter(r => r.baldes.includes("mensal")).map(r => <div key={`${r.project_id}-${r.budget_id}`} className="flex gap-3 py-1">
        <Link className="font-mono hover:text-foreground" to={linkOrcamento(r)}>{numeroOrcamento(r.orcamento_numero)}</Link><span>{r.projeto}</span>
      </div>)}
    </details>}
    {!rows ? <p className="text-xs text-warning">Prepare as referências deste fechamento antes de emitir os documentos.</p>
      : rows.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum projeto com movimento neste período.</p>
      : <>{([['mensal','Nota do fechamento'],['mensal_separado','Nota separada do mês'],['avulso','Faturados à parte']] as const).map(([balde,label]) => {
        const lista = mensal && balde === "mensal" ? [] : rows.filter(r => r.baldes.includes(balde));
        return lista.length > 0 && <div key={balde} className="space-y-1">
          <div className="flex items-center justify-between gap-2"><h4 className="text-xs text-muted-foreground">{label}</h4>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copiar(balde)}><Copy className="h-3 w-3 mr-1" /> Copiar números</Button></div>
          {lista.map(r => <div key={`${r.project_id}-${r.budget_id}`} className="flex items-baseline gap-3 text-xs py-1">
            <Link className="font-mono font-semibold text-primary shrink-0 hover:underline" to={linkOrcamento(r)}>{numeroOrcamento(r.orcamento_numero)}</Link>
            <Link className="text-muted-foreground hover:text-foreground" to={`/projetos/${r.project_id}`}>{r.projeto}</Link>
          </div>)}
        </div>;
      })}</>}
  </section>;
}
