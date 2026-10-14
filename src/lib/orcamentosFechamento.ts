export type OrcamentoFechamento = {
  project_id: string; projeto: string; budget_id: string; deal_id?: string | null;
  orcamento_numero: number; baldes: string[]; mensal?: boolean;
};
export const numeroOrcamento = (n: number) => `#${String(n).padStart(4, "0")}`;
export type OrcamentoMensalRef = { budget_id: string; orcamento_numero: number; ref_mes: string; total: number; historico?: boolean };
export const linkOrcamento = (r: OrcamentoFechamento) => r.mensal
  ? `/orcamentos-mensais/${r.budget_id}` : r.deal_id
  ? `/orcamentos/${r.deal_id}?variante=${r.budget_id}`
  : `/orcamentos-legado?budget=${r.budget_id}`;
export function referenciasOrcamentos(rows: OrcamentoFechamento[], balde?: string): string {
  return [...new Set(rows.filter(r => !balde || r.baldes.includes(balde)).map(r => r.orcamento_numero))]
    .sort((a,b) => a-b).map(numeroOrcamento).join(", ");
}

/** Projetos mistos têm duas referências. Nunca escolher só pelo project_id. */
export function referenciaProjeto(rows: OrcamentoFechamento[], projectId: string, balde = "mensal") {
  return rows.find(r => r.project_id === projectId && r.baldes.includes(balde));
}
export type ProjetoMensal = { project_id: string; projeto: string; receita: number | null; custo: number | null };
export type OrcamentoMensal = { id: string; numero: number; cliente: string; mes: string; total: number; revisao: number; projetos: ProjetoMensal[] };
export function resumoMensal(total: number, projetos: ProjetoMensal[]) {
  const centavos = (v: number) => Math.round(v * 100);
  const distribuido = projetos.reduce((s, p) => s + centavos(p.receita ?? 0), 0);
  const custos = projetos.reduce((s, p) => s + centavos(p.custo ?? 0), 0);
  const diferenca = centavos(total) - distribuido;
  const completo = projetos.length > 0 && projetos.every(p => p.custo !== null && p.receita !== null) && diferenca === 0;
  return { distribuido: distribuido / 100, custos: custos / 100, diferenca: diferenca / 100,
    completo, resultado: completo ? (centavos(total) - custos) / 100 : null };
}
