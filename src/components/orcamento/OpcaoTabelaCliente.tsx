import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { etapaComercial } from "@/lib/crm";
import { decomporPrecoFinal, type TaxasTabela } from "@/lib/precosFinais";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Origem = { id: string; status: string; precos_finais?: boolean; fechamento_mes?: string | null; aprovada_em?: string | null; aprovacoes?: {tipo?: string}[] };
type Negocio = { id: string; client_id: string | null; stage: string };
type Preco = { id: string; tipo: string; preco: number; e_diaria: boolean };
export function podeCriarOpcaoTabela(b: Origem, d: Negocio) {
  return !!d.client_id && !b.precos_finais && !b.fechamento_mes && !b.aprovada_em
    && !(b.aprovacoes || []).some(a => a.tipo === "aprovacao")
    && ["draft", "sent", "pending"].includes(b.status)
    && ["lead", "elaboracao", "proposta", "negociacao"].includes(etapaComercial(d.stage));
}
export function OpcaoTabelaCliente({ budget, deal, onCreated }: {budget: Origem; deal: Negocio; onCreated: (id: string) => void}) {
  const qc = useQueryClient();
  const [aberto,setAberto] = useState(false);
  const [nome,setNome] = useState("Tabela Sicredi");
  const [quantidades,setQuantidades] = useState<Record<string,number>>({});
  const elegivel = podeCriarOpcaoTabela(budget,deal);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey:["opcao-tabela-cliente",deal.client_id], enabled:elegivel,
    queryFn:async()=>{
      const {data:cfg,error:erroCfg}=await (supabase as any).from("client_faturamento")
        .select("orcamento_taxas_inclusas").eq("client_id",deal.client_id).eq("modelo","tabela").eq("precos_finais",true).maybeSingle();
      if(erroCfg) throw erroCfg;
      if(!cfg?.orcamento_taxas_inclusas) return null;
      const {data:precos,error:erroPrecos}=await (supabase as any).from("client_precos")
        .select("id,tipo,preco,e_diaria").eq("client_id",deal.client_id).eq("ativo",true).order("ordem");
      if(erroPrecos) throw erroPrecos;
      return {taxas:cfg.orcamento_taxas_inclusas as TaxasTabela,precos:precos as Preco[]};
    },
  });
  const escolhidos=(data?.precos || []).filter(p=>Number(quantidades[p.id] || 0)>0);
  const quantidadeInvalida=(data?.precos || []).some(p=>{
    const q=quantidades[p.id] || 0;
    return !Number.isFinite(q) || q<0 || (!p.e_diaria && !Number.isInteger(q));
  });
  const total=escolhidos.reduce((s,p)=>s+Number(p.preco)*quantidades[p.id],0);
  const parcelas=data ? decomporPrecoFinal(total,total,data.taxas) : null;
  const criar=useMutation({
    mutationFn:async()=>{
      if(!data || quantidadeInvalida || !escolhidos.length) throw new Error("Escolha os serviços e quantidades");
      const {data:id,error:erro}=await (supabase as any).rpc("orcamento_criar_opcao_tabela",{
        _budget_id:budget.id,_nome:nome.trim(),_taxas:data.taxas,
        _itens:escolhidos.map(p=>({preco_id:p.id,quantidade:quantidades[p.id],preco_unitario:Number(p.preco)})),
      });
      if(erro) throw erro;
      return id as string;
    },
    onSuccess:async(id)=>{
      await Promise.all(["orcamento-variantes","orcamento-budget","orcamento-itens","deals"].map(key=>qc.invalidateQueries({queryKey:[key]})));
      setAberto(false);onCreated(id);toast.success("Opção com tabela criada. Original preservado.");
    },
    onError:(e:Error)=>{toast.error("Não criou a opção",{description:e.message});void refetch();},
  });
  if(!elegivel || (!isLoading && !error && !data)) return null;
  if(error) return <Button size="sm" variant="outline" onClick={()=>void refetch()}>Recarregar tabela do cliente</Button>;
  return <>
    <Button size="sm" variant="outline" disabled={isLoading} onClick={()=>{setAberto(true);void refetch();}}>
      <Copy className="mr-1.5 h-3.5 w-3.5"/>Criar opção com tabela
    </Button>
    <Dialog open={aberto} onOpenChange={v=>{if(!criar.isPending)setAberto(v);}}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Nova opção com a tabela</DialogTitle>
          <DialogDescription>O original fica intacto. Selecione os serviços da nova opção.</DialogDescription></DialogHeader>
        <label className="space-y-1 text-xs">Nome da opção<Input value={nome} maxLength={80} onChange={e=>setNome(e.target.value)} disabled={criar.isPending}/></label>
        <div className="divide-y divide-border rounded-lg border border-border px-3">
          {data?.precos.map(p=><div key={p.id} className="grid grid-cols-[1fr_100px_80px] items-center gap-3 py-3">
            <span className="text-sm">{p.tipo}</span><span className="text-right text-xs tabular-nums">{formatCurrency(p.preco)}</span>
            <Input aria-label={`Quantidade de ${p.tipo}`} type="number" min={0} step={p.e_diaria?0.5:1} value={quantidades[p.id] ?? 0}
              disabled={criar.isPending} onChange={e=>setQuantidades({...quantidades,[p.id]:Number(e.target.value)})}/>
          </div>)}
        </div>
        {data && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Imposto {data.taxas.imposto}%</span><span>Margem {data.taxas.margem}%</span>
          <span>Comissão {data.taxas.comissoes.map(c=>`${c.valor}${c.tipo}`).join(" + ")}</span>
        </div>}
        <div className="flex items-end justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Base {formatCurrency(parcelas?.base || 0)}</span>
          <span className="text-lg font-semibold">Total {formatCurrency(parcelas?.total || 0)}</span>
        </div>
        {quantidadeInvalida && <p role="alert" className="text-sm text-destructive">Use quantidades inteiras para vídeos. Diárias podem ser fracionadas.</p>}
        <DialogFooter><Button variant="ghost" disabled={criar.isPending} onClick={()=>setAberto(false)}>Cancelar</Button>
          <Button onClick={()=>criar.mutate()} disabled={criar.isPending || !nome.trim() || !escolhidos.length || quantidadeInvalida}>
            {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Criar nova opção
          </Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
