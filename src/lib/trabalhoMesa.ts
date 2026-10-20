export type NaturezaTrabalho = "edicao" | "ajuste_interno" | "alteracao_cliente";

/** Identifica o trabalho atual; retrabalho sozinho é histórico da peça. */
export function naturezaTrabalho(d: {
  status?: string; rev_n1_ajuste?: boolean | null;
  rev_n2_ajuste?: boolean | null; rev_ajuste_pendente?: boolean | null;
}, alteracaoAberta?: unknown): NaturezaTrabalho {
  if (alteracaoAberta || d.status === "ajuste_solicitado") return "alteracao_cliente";
  if (d.status === "ajuste_interno" || d.rev_n1_ajuste || d.rev_n2_ajuste || d.rev_ajuste_pendente) return "ajuste_interno";
  return "edicao";
}
