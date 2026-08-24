/**
 * Como um projeto é distribuído entre as três listas do Fechamento.
 *
 * Separado da tela porque a regra tem um caso que já deu errado: projeto
 * FECHADO mas ainda não faturado caía em "em previsão" e em "fechados" ao
 * mesmo tempo, e aparecia duas vezes na tela — com botão de fechar numa delas.
 */

export const EM_ANDAMENTO = ["orcamento", "briefing", "aprovado", "producao", "revisao"];

export type Lista = "fila" | "andamento" | "arquivo" | "fora";

export function listaDoProjeto(status: string, temFechamento: boolean): Lista {
  if (status === "cancelado") return "fora";
  if (temFechamento || status === "faturado") return "arquivo";
  if (status === "entregue") return "fila";
  if (EM_ANDAMENTO.includes(status)) return "andamento";
  return "andamento";
}
