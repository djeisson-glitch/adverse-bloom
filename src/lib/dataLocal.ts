/**
 * Datas em horário LOCAL, nunca em UTC.
 *
 * `new Date().toISOString().slice(0,10)` é o jeito óbvio e está errado aqui:
 * `toISOString` converte pra UTC, e no Brasil (UTC-3) isso quer dizer que
 * DEPOIS DAS 21H o sistema inteiro acha que já é o dia seguinte.
 *
 * Medido em produção às 22h29 de 02/08/2026: a tela de Faturamento mensal
 * pedia o mês anterior e calculava `2026-07-02` em vez de `2026-07-01`.
 * Nenhum fechamento batia com esse dia, então a tela dizia "Nada gerado para
 * julho de 2026" — na véspera de faturar, com os dois rascunhos intactos no
 * banco. O mesmo desvio faz entregável com prazo hoje virar "atrasado" às
 * 21h01, e projeto criado à noite nascer com a data de amanhã.
 *
 * Use estas funções em qualquer lugar que precise de "hoje" ou "este mês".
 */

/** `YYYY-MM-DD` de uma data, no fuso de quem está olhando. */
export function dataISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Hoje, no fuso de quem está olhando. */
export function hojeISO(): string {
  return dataISO();
}

/**
 * Primeiro dia de um mês, contado a partir do mês atual.
 * `mesISO(0)` = este mês, `mesISO(-1)` = mês passado.
 */
export function mesISO(offset = 0): string {
  const d = new Date();
  return dataISO(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}

/** Primeiro dia do mês de um ano/mês (mês 1–12), sem passar por UTC. */
export function primeiroDiaISO(ano: number, mes: number): string {
  return dataISO(new Date(ano, mes - 1, 1));
}

/** Hoje mais (ou menos) N dias. */
export function emDiasISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return dataISO(d);
}
