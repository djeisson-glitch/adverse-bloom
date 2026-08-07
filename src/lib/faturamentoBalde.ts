/**
 * Os três baldes de faturamento — rótulos num lugar só.
 *
 * Eles aparecem na ficha do projeto, na peça, na lista de entregas do mês e
 * na tela de faturamento. Cada tela escrevendo o seu texto é como nasce a
 * situação em que a mesma peça é "avulso" numa tela e "à parte" em outra, e
 * alguém abre um chamado perguntando qual das duas é a verdade.
 *
 * O que separa os três:
 *
 *   mensal           dia a dia · preço do mês · nota do mês
 *   mensal_separado  dia a dia · preço do mês · NOTA PRÓPRIA
 *   avulso           outro projeto · preço por hora · nota própria
 *
 * Os dois últimos saem em documentos diferentes do fechamento; o que os
 * distingue é o PREÇO. `mensal_separado` continua valendo a tabela (ou o
 * valor-hora) que o cliente já combinou — cobrar por hora o que a tabela
 * precifica quebraria o acordo. `avulso` é trabalho fora do combinado.
 */

export type Balde = "mensal" | "mensal_separado" | "avulso";

export const BALDES: { id: Balde; label: string; curto: string; ajuda: string }[] = [
  {
    id: "mensal",
    label: "No fechamento do mês",
    curto: "no mês",
    ajuda: "Entra no fechamento e na carta do cliente, como o resto do dia a dia.",
  },
  {
    id: "mensal_separado",
    label: "No mês, em nota separada",
    curto: "nota separada",
    ajuda: "Mesmo preço do mês, mas sai numa nota própria — some do fechamento e da carta.",
  },
  {
    id: "avulso",
    label: "Avulso — faturo à parte",
    curto: "avulso",
    ajuda: "Outro projeto, cobrado por hora. Fora do fechamento e da carta.",
  },
];

const porId = new Map(BALDES.map((b) => [b.id, b]));

/** Sempre devolve um balde válido: nulo e valor desconhecido caem em mensal. */
export const balde = (v?: string | null): Balde =>
  porId.has(v as Balde) ? (v as Balde) : "mensal";

export const rotuloBalde = (v?: string | null) => porId.get(balde(v))!.label;
export const rotuloCurto = (v?: string | null) => porId.get(balde(v))!.curto;

/** Sai do fechamento do mês — os dois baldes que viram documento próprio. */
export const foraDoFechamento = (v?: string | null) => balde(v) !== "mensal";
