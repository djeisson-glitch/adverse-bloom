import { describe, expect, it } from 'vitest';
import { resumoContrato, limitesMes, type Contrato, type MovimentoContrato } from './consumoContrato';
const contrato:Contrato={id:'c',client_id:'cli',nome:'Contrato',inicio:'2026-09-15',fim:null,ativo:true,valor_mensal:5000,diarias_mes:2,entregas_mes:4,acumulo_meses:2,observacoes:null};
const movimento=(data:string,tipo:'diaria'|'entrega',quantidade=1,faturamento='mensal'):MovimentoContrato=>({id:data+tipo,tipo,data,titulo:'Item',status:'em_edicao',quantidade,faturamento,projetos:[]});
describe('consumo do contrato',()=>{
 it('separa mês, janela e histórico e não consome itens à parte',()=>{
  const r=resumoContrato(contrato,[movimento('2026-09-20','diaria'),movimento('2026-10-01','diaria',0.5),movimento('2026-10-02','diaria',1,'avulso'),movimento('2026-10-03','entrega'),movimento('2026-10-04','entrega',1,'mensal_separado')],'2026-10');
  expect(r.diarias).toBe(0.5);expect(r.diariasJanela).toBe(1.5);expect(r.entregas).toBe(1);expect(r.limiteDiarias).toBe(4);expect(r.noMes).toHaveLength(4);
 });
 it('limita vigência e não oferece franquia de meses anteriores ao início',()=>{
  const r=resumoContrato({...contrato,inicio:'2026-10-10',fim:'2026-10-20'},[movimento('2026-10-09','entrega'),movimento('2026-10-12','entrega'),movimento('2026-10-21','entrega')],'2026-10');
  expect(r.meses).toBe(1);expect(r.limiteEntregas).toBe(4);expect(r.entregas).toBe(1);
 });
 it('não libera franquia antes da vigência',()=>{const r=resumoContrato(contrato,[],'2026-08');expect(r.meses).toBe(0);expect(r.limiteDiarias).toBe(0);});
 it('mantém excedentes sem truncar consumo',()=>{const r=resumoContrato({...contrato,entregas_mes:0},[movimento('2026-10-01','entrega')],'2026-10');expect(r.limiteEntregas-r.entregasJanela).toBe(-1);});
 it('sem início conhecido não inventa crédito acumulado anterior',()=>{const r=resumoContrato({...contrato,inicio:null},[],'2026-10');expect(r.meses).toBe(1);expect(r.de).toBe('2026-10-01');});
 it('vira ano e respeita ano bissexto',()=>{expect(limitesMes('2028-02').fim).toBe('2028-02-29');const r=resumoContrato({...contrato,inicio:'2025-01-01'},[],'2026-01');expect(r.de).toBe('2025-12-01');expect(r.meses).toBe(2);});
 it('histórico inclui meses que expiraram da janela',()=>{const r=resumoContrato({...contrato,inicio:'2026-01-01'},[movimento('2026-01-10','entrega'),movimento('2026-10-10','entrega')],'2026-10');expect(r.totalEntregas).toBe(2);expect(r.entregasJanela).toBe(1);});
});
