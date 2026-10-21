/** Classificação de organização, sem efeito em cobrança, contrato ou fluxo. */
export const CATEGORIAS_ENTREGA = ["16x9", "reels", "story", "youtube", "vertical", "fotos", "outros"] as const;
export type CategoriaEntrega = typeof CATEGORIAS_ENTREGA[number];
export type FiltroEntrega = CategoriaEntrega | "sem_classificacao" | "todos";
export const ROTULOS_ENTREGA: Record<Exclude<FiltroEntrega,"todos">, string> = {
  "16x9":"16×9", reels:"Reels", story:"Story", youtube:"YouTube", vertical:"Vertical 9×16", fotos:"Fotos", outros:"Outros", sem_classificacao:"A classificar",
};
export type EntregaClassificavel = {titulo?: string | null; formato?: string | null; classificacao_visual?: string[] | null};
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_×]/g, m=>m==="×"?"x":" ");
export function classificarEntrega(item: EntregaClassificavel): {categorias: CategoriaEntrega[]; origem: "manual" | "automatica"} {
  const manual = CATEGORIAS_ENTREGA.filter(c => item.classificacao_visual?.includes(c));
  if (manual.length) return {categorias: manual, origem:"manual"};
  const titulo=normalizar(item.titulo || "");
  const texto=`${titulo} ${normalizar(item.formato || "")}`;
  const categorias=new Set<CategoriaEntrega>();
  if (/\b16\s*[x:]\s*9\b|\bhorizontal\b/.test(texto)) categorias.add("16x9");
  if (/\breels?\b/.test(texto)) categorias.add("reels");
  if (/\bstor(?:y|ies)\b/.test(texto)) categorias.add("story");
  if (/\byou\s*tube\b|\bshorts\b/.test(texto)) categorias.add("youtube");
  // Vertical não identifica o canal. Não chamar qualquer 9×16 de Reels.
  if (/\b9\s*[x:]\s*16\b|\bvertical\b|\bshorts\b/.test(texto) && !categorias.has("reels") && !categorias.has("story")) categorias.add("vertical");
  // "Mosaico de fotos" / "Vídeo com fotos" não são uma entrega fotográfica.
  const semPrefixo=titulo.replace(/^\s*(pos|prod)\s*\|\s*/, "").replace(/^\s*\d+\s*[-–—.)]\s*/, "");
  if (/^(fotos?\b|fotografias?\b|(?:cobertura|ensaio)\s+fotografic[oa]\b)/.test(semPrefixo.trim()) || /\bfotos?\b/.test(normalizar(item.formato || ""))) categorias.add("fotos");
  return {categorias:CATEGORIAS_ENTREGA.filter(c=>categorias.has(c)),origem:"automatica"};
}
export function filtroEntregaValido(valor: string): FiltroEntrega {
  return valor === "sem_classificacao" || CATEGORIAS_ENTREGA.includes(valor as CategoriaEntrega) ? valor as FiltroEntrega : "todos";
}
export function correspondeCategoria(item: EntregaClassificavel, filtro: string) {
  const f=filtroEntregaValido(filtro);const {categorias}=classificarEntrega(item);
  return f==="todos" || (f==="sem_classificacao" ? categorias.length===0 : categorias.includes(f));
}
/** Cada entrega aparece uma vez; peças com vários formatos têm grupo próprio. */
export function agruparPorCategoria<T extends EntregaClassificavel>(itens: T[]) {
  const grupos=new Map<string,{chave:string;categorias:CategoriaEntrega[];label:string;itens:T[]}>();
  for (const item of itens) {
    const {categorias}=classificarEntrega(item);const chave=categorias.join("+") || "sem_classificacao";
    if (!grupos.has(chave)) grupos.set(chave,{chave,categorias,label:categorias.map(c=>ROTULOS_ENTREGA[c]).join(" + ") || ROTULOS_ENTREGA.sem_classificacao,itens:[]});
    grupos.get(chave)!.itens.push(item);
  }
  const rank=(g: {categorias:CategoriaEntrega[]})=>g.categorias.length ? CATEGORIAS_ENTREGA.indexOf(g.categorias[0]) : 99;
  return [...grupos.values()].sort((a,b)=>rank(a)-rank(b) || a.categorias.length-b.categorias.length || a.chave.localeCompare(b.chave));
}
