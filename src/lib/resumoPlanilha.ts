/**
 * Quadro resumo da planilha: diárias, pessoas, horas de pós, entregas e o
 * resto do que o job usa — pra não precisar abrir grupo por grupo.
 *
 * As regras de contagem são as MESMAS de supabase/functions/orcamento-resumo
 * (o "Resumo do job" com IA). Mudou aqui, muda lá — senão a mesma tela mostra
 * dois números de pessoas diferentes. Única diferença, de propósito: aquele
 * vai pro cliente e só conta linha COM valor; este é pra quem está montando e
 * conta também a linha ainda sem preço (e diz quantas são).
 *
 * Pessoas = EQUIPE TÉCNICA (007) + ELENCO (006). PRODUÇÃO (003) NÃO é gente:
 * no modelo padrão ela é locação, estúdio, gerador, segurança, verba. Função
 * lançada lá (acontece em orçamento antigo) aparece em "outros", não some.
 */

export const COD_EQUIPE = "007";
export const COD_ELENCO = "006";
export const COD_POS = "011";

/** Linhas de ELENCO que são taxa/direito/empresa, não gente em set. */
const ELENCO_NAO_PESSOA = /agenciamento|direitos?\s+de\s+(uso|imagem)|renova[çc][ãa]o|casting\s*\(produtora/i;

export type LinhaPlanilha = {
  categoria_id: string | null;
  descricao: string | null;
  item_name?: string | null;
  quantity: number | null;
  diaria: number | null;
  client_unit_price?: number | null;
};
export type CategoriaPlanilha = { id: string; codigo: string; nome: string; ordem: number };
export type Funcao = { nome: string; qtd: number; diarias: number };

/**
 * Linha que o job usa: tem quantidade E diária. As linhas do modelo padrão
 * nascem com quantidade 0; linha sugerida pela IA ou criada à mão nasce com
 * quantidade e sem preço — e já conta, porque o preço vem depois.
 */
export const linhaEmUso = (i: LinhaPlanilha) => Number(i.quantity || 0) * Number(i.diaria ?? 1) > 0;

const nomeDa = (i: LinhaPlanilha) => (i.descricao || i.item_name || "").trim() || "sem descrição";
const funcaoDa = (i: LinhaPlanilha): Funcao => ({
  nome: nomeDa(i),
  qtd: Number(i.quantity || 0),
  diarias: Number(i.diaria ?? 1),
});

export function resumirPlanilha(
  itens: LinhaPlanilha[],
  categorias: CategoriaPlanilha[],
  entregas: { quantidade?: number | string | null }[],
  ocultas: Set<string> = new Set(),
) {
  const catDe = new Map(categorias.map((c) => [c.id, c]));
  const ativas = itens.filter((i) => linhaEmUso(i) && !ocultas.has(i.categoria_id || ""));
  const codigo = (i: LinhaPlanilha) => catDe.get(i.categoria_id || "")?.codigo || "";

  const equipe = ativas.filter((i) => codigo(i) === COD_EQUIPE).map(funcaoDa);
  const elencoLinhas = ativas.filter((i) => codigo(i) === COD_ELENCO);
  const elenco = elencoLinhas.filter((i) => !ELENCO_NAO_PESSOA.test(nomeDa(i))).map(funcaoDa);
  const elencoNaoPessoa = new Set(elencoLinhas.filter((i) => ELENCO_NAO_PESSOA.test(nomeDa(i))));

  const soma = (fs: Funcao[]) => fs.reduce((s, f) => s + f.qtd, 0);

  // Dia de set é o MAIOR número de diárias entre as funções — somar daria
  // diária-pessoa (6 pessoas × 3 dias = "18 diárias"), que não é dia de set.
  const diarias = [...equipe, ...elenco].reduce((m, f) => Math.max(m, f.diarias), 0);

  // Na pós a coluna "diária" é HORA. Linha de 1 hora ou menos é serviço
  // fechado (acessibilidade, trilha, locução) lançado como "1h" só pra
  // multiplicar — somar isso inventaria horas de ilha.
  const pos = ativas.filter((i) => codigo(i) === COD_POS);
  const posHoras = pos.filter((i) => Number(i.diaria ?? 1) > 1).map(funcaoDa);
  const posFechados = pos.filter((i) => Number(i.diaria ?? 1) <= 1).map(funcaoDa);
  const horasPos = posHoras.reduce((s, f) => s + f.qtd * f.diarias, 0);

  const outros = [...categorias]
    .sort((a, b) => a.ordem - b.ordem)
    .filter((c) => c.codigo !== COD_EQUIPE && c.codigo !== COD_POS)
    .map((c) => ({
      categoria: c,
      itens: ativas
        .filter((i) => i.categoria_id === c.id && (c.codigo !== COD_ELENCO || elencoNaoPessoa.has(i)))
        .map(funcaoDa),
    }))
    .filter((g) => g.itens.length > 0);

  return {
    diarias,
    pessoas: soma(equipe) + soma(elenco),
    equipe,
    elenco,
    horasPos,
    posHoras,
    posFechados,
    entregas: entregas.reduce((s, e) => s + (Number(e?.quantidade) || 0), 0),
    outros,
    linhasEmUso: ativas.length,
    semValor: ativas.filter((i) => !Number(i.client_unit_price || 0)).length,
  };
}
