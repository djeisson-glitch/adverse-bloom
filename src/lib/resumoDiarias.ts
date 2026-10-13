export type DiariaResumo = {
  project_id: string | null;
  tipo: string;
  status: string;
  fracao: number | null;
};

/** Quantidade registrada no projeto, independente do saldo contratado. */
export function resumoDiariasPorProjeto(saidas: DiariaResumo[]) {
  const totais: Record<string, number> = {};
  for (const saida of saidas) {
    if (!saida.project_id || saida.tipo !== "diaria" || saida.status === "cancelada") continue;
    totais[saida.project_id] = (totais[saida.project_id] || 0) + Number(saida.fracao ?? 1);
  }
  return totais;
}

export function rotuloDiarias(quantidade: number) {
  return `${quantidade.toLocaleString("pt-BR")} ${quantidade === 1 ? "diária registrada" : "diárias registradas"}`;
}
