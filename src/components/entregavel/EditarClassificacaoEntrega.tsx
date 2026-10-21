import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tags, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CATEGORIAS_ENTREGA, ROTULOS_ENTREGA, classificarEntrega, type CategoriaEntrega, type EntregaClassificavel } from "@/lib/classificacaoEntrega";
import { ICONES_ENTREGA } from "./ClassificacaoEntrega";
export function EditarClassificacaoEntrega({item}: {item:EntregaClassificavel & {id:string}}) {
  const qc=useQueryClient();const [aberto,setAberto]=useState(false);const [automatico,setAutomatico]=useState(true);const [categorias,setCategorias]=useState<CategoriaEntrega[]>([]);
  const salvar=useMutation({mutationFn:async()=>{
    const {data,error}=await (supabase as any).from("deliverables").update({classificacao_visual:automatico?null:categorias}).eq("id",item.id).select("id").single();
    if(error) throw error;if(!data) throw new Error("Sem permissão para alterar esta entrega");
  },onSuccess:async()=>{
    await Promise.all(["entregavel","deliverables","entregas-do-mes","minha-mesa-deliverables"].map(key=>qc.invalidateQueries({queryKey:[key]})));
    setAberto(false);toast.success("Classificação salva");
  },onError:(e:Error)=>toast.error("Não salvou a classificação",{description:e.message})});
  return <Popover open={aberto} onOpenChange={v=>{if(salvar.isPending)return;if(v){const c=classificarEntrega(item);setCategorias(c.categorias);setAutomatico(c.origem==="automatica");}setAberto(v);}}>
    <PopoverTrigger asChild><Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"><Tags className="h-3 w-3"/>Classificar</Button></PopoverTrigger>
    <PopoverContent align="start" className="w-72 space-y-3">
      <p className="text-sm font-semibold">Categorias da entrega</p>
      <button type="button" aria-pressed={automatico} disabled={salvar.isPending} onClick={()=>{setAutomatico(true);setCategorias(classificarEntrega({...item,classificacao_visual:null}).categorias);}}
        className={`w-full rounded-md border px-3 py-2 text-left text-xs ${automatico?"border-primary/40 bg-primary/10":"border-border text-muted-foreground"}`}>Automático pelo nome e formato</button>
      <div className="grid grid-cols-2 gap-1.5">{CATEGORIAS_ENTREGA.map(c=>{const Icon=ICONES_ENTREGA[c];const marcado=categorias.includes(c);return <button type="button" key={c} aria-pressed={!automatico && marcado} disabled={salvar.isPending}
        onClick={()=>{setAutomatico(false);setCategorias(automatico?[c]:marcado?categorias.filter(v=>v!==c):[...categorias,c]);}}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-2 text-xs ${!automatico && marcado?"border-primary/40 bg-primary/10":"border-border text-muted-foreground"}`}><Icon className="h-3.5 w-3.5"/>{ROTULOS_ENTREGA[c]}</button>;})}</div>
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={salvar.isPending} onClick={()=>setAberto(false)}>Cancelar</Button>
        <Button size="sm" disabled={salvar.isPending || (!automatico && !categorias.length)} onClick={()=>salvar.mutate()}>{salvar.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin"/>}Salvar</Button></div>
    </PopoverContent>
  </Popover>;
}
