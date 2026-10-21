import { Monitor, Clapperboard, Smartphone, Youtube, Image, Shapes, Tags, CircleHelp } from "lucide-react";
import { classificarEntrega, correspondeCategoria, CATEGORIAS_ENTREGA, ROTULOS_ENTREGA, filtroEntregaValido, type EntregaClassificavel, type FiltroEntrega } from "@/lib/classificacaoEntrega";
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
