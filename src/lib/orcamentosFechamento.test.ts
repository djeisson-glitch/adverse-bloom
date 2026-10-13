import { describe, it, expect } from "vitest";
import { referenciasOrcamentos, numeroOrcamento, linkOrcamento, type OrcamentoFechamento } from "./orcamentosFechamento";
const rows: OrcamentoFechamento[] = [
 {project_id:'p1',projeto:'A',budget_id:'b1',deal_id:'d1',orcamento_numero:313,baldes:['mensal','avulso']},
 {project_id:'p2',projeto:'B',budget_id:'b2',orcamento_numero:315,baldes:['mensal_separado']},
 {project_id:'p3',projeto:'C',budget_id:'b1',orcamento_numero:313,baldes:['mensal']},
];
describe('referências do fechamento', () => {
 it('não mistura números de notas diferentes nem repete orçamento compartilhado', () => {
  expect(referenciasOrcamentos(rows,'mensal')).toBe('#0313');
  expect(referenciasOrcamentos(rows,'mensal_separado')).toBe('#0315');
  expect(referenciasOrcamentos(rows,'avulso')).toBe('#0313');
 });
 it('não trunca números longos', () => { expect(numeroOrcamento(12000)).toBe('#12000'); });
 it('abre a opção exata ou o orçamento sem deal', () => {
  expect(linkOrcamento(rows[0])).toBe('/orcamentos/d1?variante=b1');
  expect(linkOrcamento(rows[1])).toBe('/orcamentos-legado?budget=b2');
 });
});
