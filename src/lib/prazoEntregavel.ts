/**
 * Prazo e atraso de um entregável — regra única, usada por todas as telas.
 *
 * Duas coisas que o sistema fazia errado:
 *
 *  1. media atraso contra o PRAZO DO CLIENTE (`data_entrega`). O prazo que
 *     cobra o time é o INTERNO; o do cliente é a promessa externa, e ela tem
 *     folga de propósito.
 *
 *  2. continuava contando atraso depois que a peça foi pro cliente. Se está na
 *     mão dele, o retorno é dele — marcar de vermelho é cobrar o time por uma
 *     coisa que não depende do time.
 */

/** Etapas em que a peça já saiu das nossas mãos. */
const COM_O_CLIENTE = ["com_cliente", "aprovado", "entregue", "faturado"];

/**
 * O prazo que vale pra cobrança.
 *
 * O interno manda. Cai pro do cliente quando não há interno: hoje só 12 dos 43
 * entregáveis ativos têm prazo interno preenchido, e sem essa queda o sistema
 * simplesmente pararia de apontar atraso — silêncio pior que o número errado.
 * Quando o time preencher o interno em todos, a queda deixa de ser usada
 * sozinha.
 */
export function prazoDe(d: any): string | null {
  return d?.prazo_interno || d?.data_entrega || null;
}

/** A bola está com o cliente? */
export function foiAoCliente(d: any): boolean {
  return COM_O_CLIENTE.includes(d?.status) || !!d?.aprovado_cliente_em;
}

/** Atrasado = passou do prazo que vale E ainda está na nossa mão. */
export function estaAtrasado(d: any, hoje: string): boolean {
  if (foiAoCliente(d)) return false;
  const p = prazoDe(d);
  return !!p && p < hoje;
}
