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

import { referenciaProjeto, resumoMensal } from './orcamentosFechamento';
it('escolhe a referência mensal ou avulsa de um projeto misto', () => {
 const mixed = [{...rows[0],baldes:['mensal'],mensal:true,budget_id:'mes'}, {...rows[0],baldes:['avulso']}];
 expect(linkOrcamento(referenciaProjeto(mixed,'p1')!)).toBe('/orcamentos-mensais/mes');
 expect(referenciaProjeto(mixed,'p1','avulso')?.budget_id).toBe('b1');
});
it('custo ausente e receita sem alocação não produzem lucro aparente', () => {
 const p={project_id:'p',projeto:'P',receita:100,custo:null};
 expect(resumoMensal(100,[p]).resultado).toBeNull();
 expect(resumoMensal(100,[{...p,custo:0}]).resultado).toBe(100);
 expect(resumoMensal(120,[{...p,custo:0}]).resultado).toBeNull();
 expect(resumoMensal(0,[]).resultado).toBeNull();
});
it('reconcilia centavos, excesso de distribuição e prejuízo', () => {
 const a={project_id:'a',projeto:'A',receita:0.1,custo:0.2};
 const b={project_id:'b',projeto:'B',receita:0.2,custo:0.3};
 expect(resumoMensal(0.3,[a,b])).toMatchObject({completo:true,diferenca:0,resultado:-0.2});
 expect(resumoMensal(0.2,[a,b])).toMatchObject({completo:false,diferenca:-0.1,resultado:null});
});
