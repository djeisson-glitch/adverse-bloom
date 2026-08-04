/**
 * Condições e direitos do orçamento — o que está e o que NÃO está incluso.
 *
 * Isto existe porque "não inclui" em texto livre falha justamente onde dói:
 * o cliente aprova, e três semanas depois pergunta cadê a janela de Libras, ou
 * descobre na entrega que aquele filme não pode ir pra TV porque ninguém
 * registrou na ANCINE. Item que não foi escrito vira discussão; item escrito
 * como "não incluso" vira upsell.
 *
 * Cada linha tem STATUS explícito em vez de presença/ausência numa lista: não
 * dizer nada sobre Libras é diferente de dizer "não incluso", e as duas coisas
 * são diferentes de "sob consulta".
 *
 * Fonte única: o editor preenche e a carta imprime a partir daqui. Duplicar o
 * catálogo garantiria que um dia os dois discordassem.
 */

export type StatusCondicao = "incluso" | "nao_incluso" | "sob_consulta" | "nao_se_aplica";

export type ItemCondicao = {
  chave: string;
  rotulo: string;
  status: StatusCondicao;
  obs?: string;
  /** Só para ANCINE: em que regimes o registro está previsto. */
  regimes?: string[];
};

export type Condicoes = {
  itens: ItemCondicao[];
  veiculacao?: { periodo?: string; praca?: string };
};

export const STATUS_LABEL: Record<StatusCondicao, string> = {
  incluso: "Incluso",
  nao_incluso: "Não incluso",
  sob_consulta: "Sob consulta",
  nao_se_aplica: "Não se aplica",
};

/**
 * Ordem de leitura, não alfabética: primeiro o que o cliente pergunta
 * (locução), depois acessibilidade — que é o bloco que mais gera pedido de
 * última hora —, e por fim direitos e registro, que é o que trava veiculação.
 */
export const CATALOGO: { chave: string; rotulo: string; ajuda?: string; padrao: StatusCondicao }[] = [
  { chave: "locucao",       rotulo: "Locução",                padrao: "nao_incluso", ajuda: "Locutor profissional, gravação e direção de voz" },
  { chave: "trilha",        rotulo: "Trilha licenciada",      padrao: "incluso",     ajuda: "Biblioteca licenciada; trilha original ou faixa comercial entram à parte" },
  { chave: "legenda",       rotulo: "Legenda em português",   padrao: "incluso" },
  { chave: "libras",        rotulo: "Janela de Libras",       padrao: "nao_incluso", ajuda: "Intérprete + janela sobreposta ao filme" },
  { chave: "audiodescricao", rotulo: "Audiodescrição",        padrao: "nao_incluso" },
  { chave: "legenda_outros", rotulo: "Legenda em outros idiomas", padrao: "nao_incluso" },
  { chave: "ancine",        rotulo: "Registro ANCINE",        padrao: "nao_se_aplica", ajuda: "CPB/CRT — obrigatório para veicular em TV e cinema" },
  { chave: "direitos_elenco", rotulo: "Direitos de imagem do elenco", padrao: "incluso", ajuda: "Vale pelo período e praça declarados abaixo" },
];

/**
 * Regimes da ANCINE. Internet não exige registro, mas está na lista de
 * propósito: marcar "só internet" é a forma de registrar que a decisão foi
 * tomada, e não esquecida.
 */
export const REGIMES_ANCINE = [
  "TV aberta",
  "TV fechada",
  "Cinema",
  "Internet / VOD",
  "Mídia indoor / OOH",
];

/** Uma condição só é notícia quando alguém decidiu algo sobre ela. */
export function temConteudo(c?: Condicoes | null): boolean {
  if (!c) return false;
  return (
    (c.itens || []).some((i) => i.status !== "nao_se_aplica" || i.obs) ||
    !!c.veiculacao?.periodo ||
    !!c.veiculacao?.praca
  );
}

/** Lista pronta pra editar: o que já foi salvo, completado com o catálogo. */
export function comPadroes(c?: Condicoes | null): Condicoes {
  const salvos = new Map((c?.itens || []).map((i) => [i.chave, i]));
  return {
    itens: CATALOGO.map((cat) => salvos.get(cat.chave) || {
      chave: cat.chave, rotulo: cat.rotulo, status: cat.padrao,
    }).concat((c?.itens || []).filter((i) => !CATALOGO.some((cat) => cat.chave === i.chave))),
    veiculacao: c?.veiculacao || {},
  };
}
