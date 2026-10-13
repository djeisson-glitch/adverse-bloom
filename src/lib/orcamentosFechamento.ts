export type OrcamentoFechamento = {
  project_id: string; projeto: string; budget_id: string; deal_id?: string | null;
  orcamento_numero: number; baldes: string[];
};
export const numeroOrcamento = (n: number) => `#${String(n).padStart(4, "0")}`;
export const linkOrcamento = (r: OrcamentoFechamento) => r.deal_id
  ? `/orcamentos/${r.deal_id}?variante=${r.budget_id}`
  : `/orcamentos-legado?budget=${r.budget_id}`;
export function referenciasOrcamentos(rows: OrcamentoFechamento[], balde?: string): string {
  return [...new Set(rows.filter(r => !balde || r.baldes.includes(balde)).map(r => r.orcamento_numero))]
    .sort((a,b) => a-b).map(numeroOrcamento).join(", ");
}
