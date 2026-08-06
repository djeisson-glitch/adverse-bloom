/**
 * Regras de recorte da carta de fechamento — em um lugar só, testável.
 *
 * Isto saiu de dentro da tela depois de uma auditoria achar TRÊS números
 * diferentes para "alterações do período" na mesma folha:
 *
 *   4 = alterações das peças do mês (qualquer data do pedido)
 *   3 = alterações pedidas no mês (qualquer peça)   ← o contador mostrava esta
 *   2 = pedidas no mês E em peça do mês             ← a tabela listava esta
 *
 * Cada bloco da carta aplicava o seu próprio recorte, e um documento que vai
 * pro cliente não pode discordar de si mesmo. A regra passa a ser uma só, e
 * está escrita aqui:
 *
 *   O MÊS DE UM JOB É O MÊS EM QUE ELE FOI CRIADO. Tudo que pertence ao job —
 *   horas, alterações, entregas — é desse mês, tenha acontecido quando tiver
 *   acontecido. Alteração pedida em agosto num job de julho é de julho, do
 *   mesmo jeito que a hora lançada em agosto é cobrada em julho.
 *
 * Sem isto, um retrabalho pedido no dia 2 de agosto some do fechamento de
 * julho (onde a hora dele é cobrada) e reaparece no de agosto (onde não há
 * hora nenhuma) — e o cliente pergunta, com razão, o que está pagando.
 */

export type PecaRecorte = { id: string; status?: string | null };
export type AlteracaoRecorte = { id: string; deliverable_id: string };

/** Peças cujo job entrou no período — o corte é a criação, sempre. */
export function pecasDoPeriodo<T extends PecaRecorte>(pecas: T[], idsCriadasNoPeriodo: Set<string>): T[] {
  return pecas.filter((p) => idsCriadasNoPeriodo.has(p.id));
}

/**
 * Alterações que entram no período.
 *
 * Segue a PEÇA, não a data do pedido. É a mesma regra das horas — e é o que
 * faz o número do resumo bater com o que está listado nas linhas.
 */
export function alteracoesDoPeriodo<T extends AlteracaoRecorte>(
  alteracoes: T[],
  idsPecasDoPeriodo: Set<string>,
): T[] {
  return alteracoes.filter((a) => idsPecasDoPeriodo.has(a.deliverable_id));
}

/** Fecharam de verdade — o resto é trabalho em curso, e a carta diz isso. */
export const STATUS_ENTREGUE = ["entregue", "aprovado", "faturado"];

export function contarEntregues<T extends PecaRecorte>(pecas: T[]): number {
  return pecas.filter((p) => STATUS_ENTREGUE.includes(String(p.status || ""))).length;
}

/**
 * Horas que entram no período.
 *
 * Hora presa a uma peça segue a peça. Hora lançada solta no projeto segue a
 * criação do projeto — é o único caso em que não há peça pra perguntar.
 */
export function horasDoPeriodo<T extends { deliverable_id?: string | null; project_id?: string | null; billable?: boolean | null }>(
  horas: T[],
  idsPecasDoPeriodo: Set<string>,
  projetoNoPeriodo: (projectId: string | null | undefined) => boolean,
): T[] {
  return horas.filter((t) => {
    if (!t.billable) return false;
    if (t.deliverable_id) return idsPecasDoPeriodo.has(t.deliverable_id);
    return projetoNoPeriodo(t.project_id);
  });
}
