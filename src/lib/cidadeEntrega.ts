import municipios from "@/data/municipiosBR";
import type { EntregaClassificavel } from "./classificacaoEntrega";

const normalizar = (s:string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\s]+/g," ").trim();
const cidades = new Map<string,{nome:string;ufs:Set<string>}>();
for (const [nome,uf] of municipios) {
  const chave=normalizar(nome);
  const cidade=cidades.get(chave) ?? {nome,ufs:new Set<string>()};
  cidade.ufs.add(uf);cidades.set(chave,cidade);
}
const estados = [...new Set(municipios.map(([,uf])=>uf))].join("|");
const ufFinal = new RegExp(`\\s*(?:/| - | – | — |\\()\\s*(${estados})\\)?$`,"i");

/** Só identifica segmentos explícitos: não confunde "Campanha de Natal" com Natal. */
export function cidadeDaEntrega(item:EntregaClassificavel): {chave:string;nome:string;uf:string|null}|null {
  let titulo=(item.titulo ?? "").trim();
  const uf= titulo.match(ufFinal)?.[1].toUpperCase() ?? null;
  if (uf) titulo=titulo.replace(ufFinal,"").trim();
  const segmentos=titulo.split(/\s+[-–—]\s+|\|/).map(s=>s.trim()).filter(Boolean);
  const encontradas=new Map<string,{chave:string;nome:string;uf:string|null}>();
  for (const segmento of segmentos) {
    const chave=normalizar(segmento.replace(/^(?:cidade|municipio|município)\s*:\s*/i,""));
    const cidade=cidades.get(chave);
    if (!cidade || (uf && !cidade.ufs.has(uf))) continue;
    encontradas.set(chave,{chave,nome:cidade.nome,uf});
  }
  // Duas cidades no mesmo título não são atribuídas arbitrariamente a uma delas.
  return encontradas.size===1 ? [...encontradas.values()][0] : null;
}

export function agruparPorCidade<T extends EntregaClassificavel>(itens:T[]) {
  const identificados=itens.map(item=>({item,cidade:cidadeDaEntrega(item)}));
  const ufsPorNome=new Map<string,Set<string>>();
  for (const {cidade} of identificados) if (cidade?.uf) {
    const ufs=ufsPorNome.get(cidade.chave) ?? new Set<string>();ufs.add(cidade.uf);ufsPorNome.set(cidade.chave,ufs);
  }
  const grupos=new Map<string,{chave:string;label:string;itens:T[]}>();
  for (const {item,cidade} of identificados) {
    // UF só divide a cidade quando há localidades homônimas explícitas no projeto.
    const homonimas=cidade && (ufsPorNome.get(cidade.chave)?.size ?? 0)>1;
    const chave=cidade ? `${cidade.chave}${homonimas?`:${cidade.uf ?? "?"}`:""}` : "sem_cidade";
    const label=cidade ? `${cidade.nome}${homonimas?` · ${cidade.uf ?? "UF não informada"}`:""}` : "Sem cidade identificada";
    if (!grupos.has(chave)) grupos.set(chave,{chave,label,itens:[]});
    grupos.get(chave)!.itens.push(item);
  }
  return [...grupos.values()].sort((a,b)=>Number(a.chave==="sem_cidade")-Number(b.chave==="sem_cidade") || a.label.localeCompare(b.label,"pt-BR"));
}
