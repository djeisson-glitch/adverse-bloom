import { agruparPorCidade } from "@/lib/cidadeEntrega";
import { Fragment, useId, useState, type ReactNode } from "react";
import { ChevronDown, MapPin, Monitor, Clapperboard, Smartphone, Youtube, Image, Shapes, Tags, CircleHelp } from "lucide-react";
import { agruparPorCategoria, classificarEntrega, correspondeCategoria, CATEGORIAS_ENTREGA, ROTULOS_ENTREGA, filtroEntregaValido, type EntregaClassificavel, type FiltroEntrega } from "@/lib/classificacaoEntrega";
export const ICONES_ENTREGA = {"16x9":Monitor,reels:Clapperboard,story:Smartphone,youtube:Youtube,vertical:Smartphone,fotos:Image,outros:Shapes,sem_classificacao:CircleHelp};
export function EtiquetasEntrega({item, ocultarIndefinido=false}: {item:EntregaClassificavel;ocultarIndefinido?:boolean}) {
  const {categorias,origem}=classificarEntrega(item);
  if (!categorias.length && ocultarIndefinido) return null;
  const valores=categorias.length ? categorias : ["sem_classificacao" as const];
  return <span className="inline-flex flex-wrap items-center gap-1" aria-label="Categorias da entrega">
    {valores.map(c=>{const Icon=ICONES_ENTREGA[c];return <span key={c} title={`${origem==="manual"?"Classificação manual":"Pelo nome e formato"}: ${ROTULOS_ENTREGA[c]}`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-muted-foreground">
      <Icon aria-hidden="true" className="h-3 w-3"/>{ROTULOS_ENTREGA[c]}</span>;})}
  </span>;
}
export function FiltrosEntrega({itens,valor,onChange}: {itens:EntregaClassificavel[];valor:string;onChange:(valor:FiltroEntrega)=>void}) {
  const ativo=filtroEntregaValido(valor);
  const opcoes: FiltroEntrega[]=["todos",...CATEGORIAS_ENTREGA,"sem_classificacao"];
  return <div aria-label="Filtrar entregas por categoria" className="flex flex-wrap gap-1.5">
    {opcoes.map(c=>{
      const n=itens.filter(i=>correspondeCategoria(i,c)).length;
      if (!["todos","16x9","reels","story","youtube"].includes(c) && !n && ativo!==c) return null;
      const Icon=c==="todos"?Tags:ICONES_ENTREGA[c];
      return <button type="button" key={c} aria-pressed={ativo===c} onClick={()=>onChange(c)}
        title="Uma entrega com vários formatos pode aparecer em mais de um filtro"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${ativo===c?"border-primary/40 bg-primary/10 font-medium text-foreground":"border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}>
        <Icon aria-hidden="true" className="h-3.5 w-3.5"/>{c==="todos"?"Todos":ROTULOS_ENTREGA[c]}<span className="text-[10px] tabular-nums opacity-70">{n}</span>
      </button>;
    })}
  </div>;
}

/** Blocos sempre visíveis, com uma única ocorrência de cada entregável. */
export function BlocosEntrega<T extends EntregaClassificavel & {id:string}>({itens,renderItem,className=""}: {
  itens:T[]; renderItem:(item:T)=>ReactNode; className?:string;
}) {
  return <div className="space-y-4">
    {agruparPorCategoria(itens).map(grupo=>{
      const Icon=ICONES_ENTREGA[grupo.categorias[0] ?? "sem_classificacao"];
      return <section key={grupo.chave} aria-label={grupo.label} className={`rounded-xl border border-border/70 bg-card ${className}`}>
        <header className="flex items-center gap-2.5 rounded-t-xl border-b border-border/60 bg-muted/40 px-3 py-3">
          <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground"/>
          <h3 className="text-sm font-semibold text-foreground">{grupo.label}</h3>
          <span aria-label={`${grupo.itens.length} entregáveis`} className="ml-auto rounded-md bg-background/70 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{grupo.itens.length}</span>
        </header>
        <div className="space-y-1 p-2">{grupo.itens.map(item=><Fragment key={item.id}>{renderItem(item)}</Fragment>)}</div>
      </section>;
    })}
  </div>;
}

/** Cidade → formatos. Sem localização reconhecida, mantém apenas os formatos. */
export function BlocosPorCidade<T extends EntregaClassificavel & {id:string}>(props: {
  itens:T[]; renderItem:(item:T)=>ReactNode; className?:string;
}) {
  const [abertas,setAbertas]=useState<Set<string>>(()=>new Set());
  const id=useId();
  const grupos=agruparPorCidade(props.itens);
  if (grupos.every(g=>g.chave==="sem_cidade")) return <BlocosEntrega {...props}/>;
  return <div className="space-y-3">{grupos.map(g=>{
    const aberta=abertas.has(g.chave);
    const conteudoId=`${id}-${g.chave}`;
    return <section key={g.chave} aria-label={`Cidade: ${g.label}`}>
      <h2>
        <button type="button" aria-expanded={aberta} aria-controls={conteudoId}
          onClick={()=>setAbertas(antes=>{const proximas=new Set(antes);if(proximas.has(g.chave)) proximas.delete(g.chave);else proximas.add(g.chave);return proximas;})}
          className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberta?"":"-rotate-90"}`}/>
          <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground"/>
          <span className="text-base font-semibold text-foreground">{g.label}</span>
          <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">{g.itens.length} {g.itens.length===1?"entrega":"entregas"}</span>
        </button>
      </h2>
      <div id={conteudoId} hidden={!aberta} className="pt-3">
        <BlocosEntrega itens={g.itens} renderItem={props.renderItem} className={props.className}/>
      </div>
    </section>;
  })}</div>;
}
