import {Fragment,useId,type ReactNode} from "react";
import {useLocalPref} from "@/hooks/useLocalPref";
import {agruparPorStatus,agrupamentoAutomatico,MODOS_AGRUPAMENTO,ROTULOS_AGRUPAMENTO,type EntregaAgrupavel,type ModoAgrupamento} from "@/lib/agrupamentoEntregas";
import {BlocosEntrega,BlocosPorCidade} from "./ClassificacaoEntrega";
type Props<T extends EntregaAgrupavel>={projectId:string;itens:T[];renderItem:(item:T)=>ReactNode;cabecalho?:ReactNode};
/** A chave reinicia a preferência ao navegar entre projetos sem desmontar a página. */
export function EntregaveisAgrupados<T extends EntregaAgrupavel>(props:Props<T>) {
 return <ListaProjeto key={props.projectId} {...props}/>;
}
function ListaProjeto<T extends EntregaAgrupavel>({projectId,itens,renderItem,cabecalho}:Props<T>) {
 const [modo,setModo]=useLocalPref<ModoAgrupamento>(`entregaveis:agrupamento:${projectId}`,"automatico",MODOS_AGRUPAMENTO);
 const seletorId=useId();
 const automatico=agrupamentoAutomatico(itens);
 const efetivo=modo==="automatico"?automatico:modo;
 return <>
   <div className="flex flex-wrap items-center justify-between gap-3">
     <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Entregáveis</p>
     <div className="flex items-center gap-2">
       <label htmlFor={seletorId} className="text-xs text-muted-foreground">Agrupar por</label>
       <select id={seletorId} value={modo} onChange={e=>setModo(e.target.value as ModoAgrupamento)} className="h-9 max-w-full rounded-md border border-border/70 bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
         {MODOS_AGRUPAMENTO.map(m=><option key={m} value={m}>{m==="automatico"?`Automático · ${ROTULOS_AGRUPAMENTO[automatico]}`:ROTULOS_AGRUPAMENTO[m]}</option>)}
       </select>
     </div>
   </div>
   {!itens.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum entregável.</p>}
   <div className="-mx-1 space-y-4 overflow-x-auto px-1 pb-1">
     {itens.length>0 && cabecalho}
     {efetivo==="cidade" && <BlocosPorCidade itens={itens} renderItem={renderItem} className="min-w-[680px]"/>}
     {efetivo==="formato" && <BlocosEntrega itens={itens} renderItem={renderItem} className="min-w-[680px]"/>}
     {efetivo==="status" && agruparPorStatus(itens).map(g=><section key={g.chave} aria-label={`Status: ${g.label}`} className="min-w-[680px] rounded-xl border border-border/70 bg-card">
       <header className="flex items-center justify-between rounded-t-xl border-b border-border/60 bg-muted/40 px-3 py-3"><h3 className="text-sm font-semibold">{g.label}</h3><span className="text-xs tabular-nums text-muted-foreground">{g.itens.length}</span></header>
       <div className="space-y-1 p-2">{g.itens.map(i=><Fragment key={i.id}>{renderItem(i)}</Fragment>)}</div>
     </section>)}
     {efetivo==="nenhum" && <div className="space-y-1">{itens.map(i=><Fragment key={i.id}>{renderItem(i)}</Fragment>)}</div>}
   </div>
 </>;
}
