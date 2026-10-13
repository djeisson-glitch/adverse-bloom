import { expect, it } from 'vitest';
import { execucaoContrato } from './execucaoContrato';
import type { Contrato, MovimentoContrato } from './consumoContrato';
const c: Contrato = {id:'c',client_id:'cli',nome:'SLC',inicio:'2026-02-01',fim:'2027-01-31',ativo:true,valor_mensal:6100,diarias_mes:1,entregas_mes:8,acumulo_meses:2,validade_creditos_dias:60,limite_diarias_acumuladas:2,limite_entregas_acumuladas:16,franquia_entregas_tipo:'video_foto',observacoes:null};
const m = (patch: Partial<MovimentoContrato> = {}): MovimentoContrato => ({id:'x',tipo:'entrega',titulo:'Vídeo',data:'2026-03-01',quantidade:1,status:'entregue',faturamento:'mensal',projetos:[],...patch});
const calc = (rows: MovimentoContrato[], patch: Partial<Contrato> = {}) => execucaoContrato({...c,...patch},rows,'2026-10-13');
it('subtrai apenas entregas concluídas e diárias realizadas do total integral',()=>{
 const r=calc([m({quantidade:40}),m({titulo:'Fotos',quantidade:4}),m({status:'em_edicao',quantidade:6}),m({tipo:'diaria',status:'realizada',quantidade:5.5}),m({tipo:'diaria',status:'programada',quantidade:2})]);
 expect(r.entregas).toEqual({total:96,realizado:44,restante:52,excedente:0});
 expect(r.diarias).toEqual({total:12,realizado:5.5,restante:6.5,excedente:0});
 expect(r.videos).toBe(40);expect(r.fotos).toBe(4);expect(r.emAndamento).toBe(6);
});
it('não reduz total por expiração, teto ou créditos que ainda serão liberados',()=>{
 const rows=[m({quantidade:30})];expect(calc(rows).entregas).toEqual(calc(rows,{validade_creditos_dias:1,limite_entregas_acumuladas:0}).entregas);
 expect(execucaoContrato(c,rows,'2026-04-01').entregas.restante).toBe(66);
 expect(execucaoContrato(c,rows,'2027-02-01').entregas.restante).toBe(66);
});
it('aprovação interna, envio ao cliente, cancelamentos e trabalhos à parte não são entregas concluídas no fee',()=>{
 const rows=['em_edicao','revisao_n1','pronto','com_cliente','ajuste_solicitado','cancelado','reprovado','arquivado'].map(status=>m({status}));
 rows.push(m({faturamento:'mensal_separado'}),m({faturamento:'avulso'}),m({status:'aprovado'}));
 expect(calc(rows).entregas.realizado).toBe(1);
});
it('exclui fora de vigência, futuro, tarefas e marcos',()=>{
 expect(calc([m({data:'2026-01-31'}),m({data:'2027-02-01'}),m({data:'2026-10-15'}),m({tipo_registro:'marco'}),m({tipo_registro:'tarefa_publica'})]).entregas.realizado).toBe(0);
});
it('sinaliza apenas peças concluídas sem tipo como pendência do total',()=>{
 const r=calc([m({titulo:'Peça A'}),m({titulo:'Peça B',status:'em_edicao'}),m({titulo:'Peça C',tipo_midia:'foto'}),m({tipo_midia:'outro'})]);
 expect(r.pendentes).toHaveLength(1);expect(r.entregas.realizado).toBe(1);
});
it('usa a fração realizada em datas com captações realizadas e programadas',()=>{
 expect(calc([m({tipo:'diaria',status:'programada',quantidade:1,quantidade_realizada:0.5})]).diarias.realizado).toBe(0.5);
});
it('não inventa total sem vigência e destaca excesso sem saldo negativo',()=>{
 expect(calc([],{fim:null}).entregas.restante).toBeNull();
 expect(calc([m({quantidade:100})]).entregas).toEqual({total:96,realizado:100,restante:0,excedente:4});
});
