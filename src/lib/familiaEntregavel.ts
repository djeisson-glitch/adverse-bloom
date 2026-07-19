/**
 * Agrupa entregáveis por semelhança pra facilitar a leitura da lista.
 *
 * A regra segue os dados, não um chute:
 * - Se `formato`/`duração` estiverem preenchidos, é por eles (é o sinal certo).
 *   Hoje as duas colunas estão vazias em 100% da base — conforme o time
 *   preencher, o agrupamento melhora sozinho.
 * - Sem isso, cai no nome. Tira o prefixo ("PÓS | ") e a numeração ("01 - ",
 *   "Ep. 03 ") e agrupa por primeira palavra; se todo mundo do grupo também
 *   compartilha a segunda, o rótulo usa as duas ("Recorte 30s" em vez de só
 *   "Recorte").
 *
 * Nunca agrupa à toa: item sozinho vai pro fim em "Avulsos", e se nada se
 * parece com nada a função devolve null pra tela renderizar reto como antes.
 */

export type ItemAgrupavel = {
  titulo: string;
  formato?: string | null;
  duracao?: string | null;
};

export type GrupoEntregaveis<T> = {
  chave: string;
  label: string;
  itens: T[];
};

const PREFIXO = /^\s*(PÓS|POS|PROD|DESL)\s*\|\s*/i;
const NUMERACAO = /^\s*(ep\.?\s*)?\d{1,3}\s*[-–—.:)]+\s*/i;
const BORDAS = /^[-–—.:,;()[\]"']+|[-–—.:,;()[\]"']+$/g;

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Palavras "de verdade" do título, sem prefixo, numeração nem pontuação solta. */
function palavras(titulo: string): string[] {
  const limpo = (titulo || "").replace(PREFIXO, "").replace(NUMERACAO, "").trim();
  return limpo
    .split(/\s+/)
    .map((t) => t.replace(BORDAS, ""))
    .filter(Boolean);
}

const AVULSOS = "__avulsos__";

export function agruparEntregaveis<T extends ItemAgrupavel>(
  itens: T[],
): GrupoEntregaveis<T>[] | null {
  // Projeto com 1 ou 2 entregáveis não ganha nada com cabeçalho de grupo.
  if (itens.length < 3) return null;

  type Balde = { label: string; itens: T[]; segundas: (string | null)[] };
  const baldes = new Map<string, Balde>();

  for (const it of itens) {
    const explicito = [it.formato?.trim(), it.duracao?.trim()].filter(Boolean).join(" · ");
    let chave: string;
    let label: string;
    let segunda: string | null = null;

    if (explicito) {
      chave = `f:${semAcento(explicito)}`;
      label = explicito;
    } else {
      const p = palavras(it.titulo);
      if (!p.length) {
        chave = AVULSOS;
        label = "Avulsos";
      } else {
        chave = `t:${semAcento(p[0])}`;
        label = p[0];
        segunda = p[1] || null;
      }
    }

    const balde = baldes.get(chave);
    if (balde) {
      balde.itens.push(it);
      balde.segundas.push(segunda);
    } else {
      baldes.set(chave, { label, itens: [it], segundas: [segunda] });
    }
  }

  // "Recorte" vira "Recorte 30s" quando o grupo inteiro compartilha a 2ª palavra.
  for (const balde of baldes.values()) {
    if (balde.itens.length < 2) continue;
    const primeira = balde.segundas[0];
    if (!primeira) continue;
    const todosIguais = balde.segundas.every(
      (s) => s && semAcento(s) === semAcento(primeira),
    );
    if (todosIguais) balde.label = `${balde.label} ${primeira}`;
  }

  // Quem ficou sozinho não vira grupo de um: junta tudo em "Avulsos".
  const grupos: GrupoEntregaveis<T>[] = [];
  const avulsos: T[] = [];
  for (const [chave, balde] of baldes) {
    if (chave === AVULSOS || balde.itens.length < 2) avulsos.push(...balde.itens);
    else grupos.push({ chave, label: balde.label, itens: balde.itens });
  }

  // Nada se parece com nada: melhor lista reta do que cabeçalho inútil.
  if (!grupos.length) return null;

  grupos.sort((a, b) => b.itens.length - a.itens.length || a.label.localeCompare(b.label, "pt-BR"));
  if (avulsos.length) grupos.push({ chave: AVULSOS, label: "Avulsos", itens: avulsos });
  return grupos;
}
