import { describe, it, expect } from 'vitest';
import { calcularCreditos, somarDias, tipoMidia } from './creditosContrato';
import type { Contrato, MovimentoContrato } from './consumoContrato';
const c: Contrato = {id:'c',client_id:'cli',nome:'SLC',inicio:'2026-02-01',fim:'2027-01-31',ativo:true,valor_mensal:6100,diarias_mes:1,entregas_mes:8,acumulo_meses:2,validade_creditos_dias:60,limite_diarias_acumuladas:2,limite_entregas_acumuladas:16,franquia_entregas_tipo:'video',observacoes:null};
const m=(data:string,quantidade=1,patch:Partial<MovimentoContrato>={}):MovimentoContrato=>({id:data+JSON.stringify(patch),data,quantidade,tipo:'entrega',titulo:'Vídeo',status:'entregue',faturamento:'mensal',projetos:[],...patch});
const run=(rows:MovimentoContrato[],corte:string,patch:Partial<Contrato>={})=>calcularCreditos({...c,...patch},rows,corte.slice(0,7),corte);
describe('classificação da franquia de vídeos',()=>{
 it('separa fotos, vídeos, outros registros e títulos ambíguos',()=>{
  expect(tipoMidia(m('2026-02-02',1,{titulo:'PÓS | Fotos'}))).toBe('foto');
  expect(tipoMidia(m('2026-02-02',1,{titulo:'PÓS | aftermovie'}))).toBe('video');
  expect(tipoMidia(m('2026-02-02',1,{titulo:'Vídeo e fotos'}))).toBe('conferir');
  expect(tipoMidia(m('2026-02-02',1,{titulo:'Campanha'}))).toBe('conferir');
  expect(tipoMidia(m('2026-02-02',1,{tipo_registro:'marco'}))).toBe('outro');
 });
 it('prioriza confirmação explícita sobre o nome',()=>expect(tipoMidia(m('2026-02-02',1,{titulo:'Fotos',tipo_midia:'video'}))).toBe('video'));
 it('não desconta fotos, tarefas, peças à parte, canceladas nem desconhecidas',()=>{
  const r=run([m('2026-02-02'),m('2026-02-02',1,{titulo:'Fotos'}),m('2026-02-02',1,{titulo:'Peça sem tipo'}),m('2026-02-02',1,{tipo_registro:'tarefa_publica'}),m('2026-02-02',1,{status:'cancelado'}),m('2026-02-02',1,{status:'reprovado'}),m('2026-02-02',1,{faturamento:'avulso'}),m('2026-02-02',1,{faturamento:'mensal_separado'})],'2026-02-10');
  expect(r.entregas.saldo).toBe(7);expect(r.fotosMes).toBe(1);expect(r.pendentes).toHaveLength(1);
 });
 it('permite franquia genérica de entregáveis em outros contratos',()=>expect(run([m('2026-02-02',1,{titulo:'Fotos'})],'2026-02-10',{franquia_entregas_tipo:'todos'}).entregas.saldo).toBe(7));
});
describe('créditos por competência',()=>{
 it('consome lotes antigos primeiro e não faz saldo usado reaparecer',()=>{
  const r=run([m('2026-02-10',8),m('2026-03-10',4)],'2026-04-02');
  expect(r.entregas.saldo).toBe(12);expect(r.entregas.lotes[0].consumido).toBe(8);expect(r.entregas.lotes[1].consumido).toBe(4);
 });
 it('expira no dia exato 60, sem tratar como dois meses',()=>{
  expect(somarDias('2026-02-01',60)).toBe('2026-04-02');
  const before=run([],'2026-04-01',{limite_entregas_acumuladas:null});
  const after=run([],'2026-04-02',{limite_entregas_acumuladas:null});
  expect(before.entregas.lotes[0].saldo).toBe(8);expect(after.entregas.lotes[0].saldo).toBe(0);expect(after.entregas.lotes[0].expirado).toBe(8);
 });
 it('não permite consumir um lote já expirado',()=>{
  const r=run([m('2026-04-02',17)],'2026-04-02',{limite_entregas_acumuladas:null});
  expect(r.entregas.excedente).toBe(1);expect(r.entregas.lotes[0].consumido).toBe(0);
 });
 it('limita acúmulo a 2 diárias e 16 vídeos, registrando retirada pelo teto',()=>{
  const r=run([],'2026-04-01');expect(r.diarias.saldo).toBe(2);expect(r.entregas.saldo).toBe(16);
  expect(r.entregas.limitado).toBe(8);expect(r.entregas.lotes[0].limitado).toBe(8);
 });
 it('excedente antigo não é pago com créditos futuros',()=>{
  const r=run([m('2026-02-02',10)],'2026-03-01');expect(r.entregas.saldo).toBe(8);expect(r.entregas.excedente).toBe(2);expect(r.entregas.excedenteMes).toBe(0);
 });
 it('distingue excedente do mês de saldo disponível posterior',()=>{
  const r=run([m('2026-02-02',10)],'2026-02-28');expect(r.entregas.excedenteMes).toBe(2);expect(r.entregas.saldo).toBe(0);
 });
 it('respeita corte diário, futuras captações e frações de diária',()=>{
  const rows=[m('2026-02-03',0.5,{tipo:'diaria'}),m('2026-02-15',1,{tipo:'diaria',status:'programada'})];
  expect(run(rows,'2026-02-13').diarias.saldo).toBe(0.5);expect(run(rows,'2026-02-15').diarias.excedenteMes).toBe(0.5);
 });
 it('não libera créditos antes do início, e restringe mês parcial',()=>{
  expect(run([],'2026-01-31').entregas.saldo).toBe(0);
  expect(run([m('2026-02-02',8)],'2026-02-15',{inicio:'2026-02-15'}).entregas.saldo).toBe(8);
 });
 it('não gera franquias após fim nem deixa saldo disponível fora da vigência',()=>{
  const r=run([],'2027-02-01');expect(r.entregas.saldo).toBe(0);expect(r.entregas.lotes).toHaveLength(12);
 });
 it('sem data inicial calcula somente o mês selecionado e sinaliza incompletude',()=>{
  const r=run([m('2026-02-02',8)],'2026-05-10',{inicio:null});expect(r.semInicio).toBe(true);expect(r.entregas.lotes).toHaveLength(1);expect(r.entregas.saldo).toBe(8);
 });
 it('lida com ano bissexto e virada do ano',()=>{
  expect(somarDias('2028-02-01',60)).toBe('2028-04-01');expect(somarDias('2026-12-01',60)).toBe('2027-01-30');
 });
 it('conserva todos os créditos e respeita o teto com consumo em vários meses',()=>{
  const rows=Array.from({length:11},(_,i)=>m(`2026-${String(i+2).padStart(2,'0')}-10`,i%3===0?20:3));
  const r=run(rows,'2026-12-31');for(const conta of [r.diarias,r.entregas]) for(const l of conta.lotes) expect(l.concedido).toBe(l.consumido+l.expirado+l.limitado+l.saldo);
  expect(r.entregas.saldo).toBeLessThanOrEqual(16);expect(r.entregas.consumo).toBe(r.entregas.lotes.reduce((n,l)=>n+l.consumido,0)+r.entregas.excedente);
 });
});

describe('franquia compartilhada e visão geral',()=>{
 it('cada entrega de fotos e vídeo usa o mesmo saldo; outros e tarefas ficam fora',()=>{
  const r=run([m('2026-10-02',1,{titulo:'Fotos'}),m('2026-10-03'),m('2026-10-03',1,{titulo:'Outro',tipo_midia:'outro'}),m('2026-10-03',1,{tipo_registro:'marco'})],'2026-10-13',{franquia_entregas_tipo:'video_foto'});
  expect(r.entregas.saldo).toBe(14);expect(r.entregasMes).toBe(2);expect(r.videosMes).toBe(1);expect(r.fotosMes).toBe(1);expect(r.totalFotos).toBe(1);
 });
 it('mantém o teto compartilhado em 16, sem criar uma segunda franquia de fotos',()=>{
  const r=run([m('2026-02-10',10,{titulo:'Fotos'})],'2026-03-01',{franquia_entregas_tipo:'video_foto'});
  expect(r.entregas.excedente).toBe(2);expect(r.entregas.saldo).toBe(8);
 });
 it('expiração leva em conta consumo de fotos por FIFO',()=>{
  const r=run([m('2026-02-10',6,{titulo:'Fotos'}),m('2026-03-10',3)],'2026-04-02',{franquia_entregas_tipo:'video_foto'});
  expect(r.entregas.lotes[0].consumido).toBe(8);expect(r.entregas.saldo).toBe(15);
 });
});
it('peças ignoradas não consomem créditos nem aparecem na composição ou pendências, inclusive franquia genérica',()=>{
 const rows=[m('2026-02-02',1,{ignorar_contrato:true}),m('2026-02-02',1,{titulo:'Fotos',ignorar_contrato:true}),m('2026-02-02',1,{titulo:'Sem tipo',ignorar_contrato:true})];
 for(const tipo of ['video','video_foto','todos'] as const){const r=run(rows,'2026-02-10',{franquia_entregas_tipo:tipo});expect(r.entregas.saldo).toBe(8);expect(r.totalVideos).toBe(0);expect(r.totalFotos).toBe(0);expect(r.fotosMes).toBe(0);expect(r.entregasMes).toBe(0);expect(r.pendentes).toHaveLength(0);}
 expect(run([{...rows[0],ignorar_contrato:false}],'2026-02-10').entregas.saldo).toBe(7);
});
