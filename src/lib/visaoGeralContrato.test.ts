import {expect,it} from 'vitest';
import {calcularCreditos,visaoGeralContrato} from './creditosContrato';
import type {Contrato} from './consumoContrato';
const c:Contrato={id:'c',client_id:'cli',nome:'SLC',inicio:'2026-02-01',fim:'2027-01-31',ativo:true,valor_mensal:6100,diarias_mes:1,entregas_mes:8,acumulo_meses:2,validade_creditos_dias:60,limite_diarias_acumuladas:2,limite_entregas_acumuladas:16,franquia_entregas_tipo:'video_foto',observacoes:null};
const geral=(data:string,patch:Partial<Contrato>={})=>{const contrato={...c,...patch};return visaoGeralContrato(contrato,calcularCreditos(contrato,[],data.slice(0,7),data),data);};
it('distingue total contratado, liberado e futuro, sem oferecer crédito futuro agora',()=>{
 const r=geral('2026-10-13');expect(r.entregas.totalPrevisto).toBe(96);expect(r.entregas.liberado).toBe(72);expect(r.entregas.aLiberar).toBe(24);expect(r.diarias.totalPrevisto).toBe(12);expect(r.diarias.aLiberar).toBe(3);expect(r.proximaLiberacao).toBe('2026-11-01');expect(r.entregas.proximoVencimento).toBe('2026-10-31');expect(r.entregas.venceQuantidade).toBe(8);
});
it('antes da vigência, nada liberado e todo o contrato ainda por liberar',()=>{const r=geral('2026-01-15');expect(r.entregas.liberado).toBe(0);expect(r.entregas.aLiberar).toBe(96);expect(r.proximaLiberacao).toBe('2026-02-01');expect(r.entregas.proximoVencimento).toBeNull();});
it('no último mês, não projeta franquias após a vigência e respeita seu encerramento',()=>{const r=geral('2027-01-31');expect(r.entregas.aLiberar).toBe(0);expect(r.entregas.proximoVencimento).toBe('2027-02-01');expect(r.proximaLiberacao).toBeNull();});
it('após vigência, não oferece saldo nem concessões futuras',()=>{const r=geral('2027-02-01');expect(r.entregas.proximoVencimento).toBeNull();expect(r.entregas.aLiberar).toBe(0);});
it('contrato sem fim não inventa total nem saldo futuro',()=>{const r=geral('2026-10-13',{fim:null});expect(r.entregas.totalPrevisto).toBeNull();expect(r.entregas.aLiberar).toBeNull();});
