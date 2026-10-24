import { agruparPorCidade } from "./cidadeEntrega";
import { classificarEntrega, type EntregaClassificavel } from "./classificacaoEntrega";
import { normalizarStatusEntregavel, STATUS_ENTREGAVEL, statusLabel } from "./statusEntregavel";
export const MODOS_AGRUPAMENTO = ["automatico","cidade","formato","status","nenhum"] as const;
export type ModoAgrupamento = typeof MODOS_AGRUPAMENTO[number];
export type EntregaAgrupavel = EntregaClassificavel & {id:string;status?:string|null};
export const ROTULOS_AGRUPAMENTO:Record<ModoAgrupamento,string> = {automatico:"Automático",cidade:"Cidade",formato:"Formato",status:"Status",nenhum:"Sem agrupamento"};
export function agrupamentoAutomatico(itens:EntregaAgrupavel[]):Exclude<ModoAgrupamento,"automatico"> {
  if (!itens.length) return "nenhum";
  const cidades=agruparPorCidade(itens).filter(g=>g.chave!=="sem_cidade");
  const identificados=cidades.reduce((n,g)=>n+g.itens.length,0);
  if (cidades.length>=2 && identificados/itens.length>=0.6) return "cidade";
  return itens.some(i=>classificarEntrega(i).categorias.length) ? "formato" : "nenhum";
}
export function agruparPorStatus<T extends EntregaAgrupavel>(itens:T[]) {
  const grupos=new Map<string,{chave:string;label:string;itens:T[]}>();
  for (const item of itens) {
    const chave=normalizarStatusEntregavel(item.status || "sem_status");
    if(!grupos.has(chave)) grupos.set(chave,{chave,label:chave==="sem_status"?"Sem status":statusLabel(chave),itens:[]});
    grupos.get(chave)!.itens.push(item);
  }
  const ordem=(s:string)=>{const i=STATUS_ENTREGAVEL.findIndex(x=>x.id===s);return i<0?999:i;};
  return [...grupos.values()].sort((a,b)=>ordem(a.chave)-ordem(b.chave)||a.label.localeCompare(b.label));
}
