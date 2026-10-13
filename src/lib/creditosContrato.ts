import type { Contrato, MovimentoContrato } from './consumoContrato';
import { limitesMes } from './consumoContrato';

import { tipoMidia, consomeFranquia } from './midiaContrato';
export { tipoMidia } from './midiaContrato';

// Calendar-only UTC arithmetic avoids local DST and parsing YYYY-MM-DD in local time.
export function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function proximoMes(data: string) {
  const d = new Date(`${data.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
const round = (n: number) => Math.round(n * 10000) / 10000;
export type LoteCredito = { competencia: string; liberadoEm: string; expiraEm: string; concedido: number; consumido: number; expirado: number; limitado: number; saldo: number };
export type ContaCredito = { saldo: number; consumo: number; excedente: number; excedenteMes: number; expirado: number; limitado: number; lotes: LoteCredito[] };

/** FIFO per competence. Expiration is exclusive: a credit cannot be used on expiraEm.
 * Uncovered consumption stays as an overage; future grants never pay past overages.
 * The cap applies to available balance (oldest unused credits are discarded first).
 */
export function calcularCreditos(c: Contrato, movimentos: MovimentoContrato[], mes: string, corte: string) {
  const periodo = limitesMes(mes);
  const ate = [periodo.fim, corte, c.fim || '9999-12-31'].sort()[0];
  const inicio = c.inicio || periodo.inicio;
  const validos = movimentos.filter(m => m.data >= inicio && m.data <= ate &&
    !['cancelado', 'cancelada', 'reprovado'].includes(m.status));
  const noMes = validos.filter(m => m.data >= periodo.inicio);
  const fee = validos.filter(m => m.faturamento === 'mensal' && !m.ignorar_contrato);
  const videos = fee.filter(m => m.tipo === 'entrega' && tipoMidia(m) === 'video');
  const entregas = fee.filter(m => m.tipo === 'entrega' && consomeFranquia(c.franquia_entregas_tipo,m));
  const somar = (rows: MovimentoContrato[]) => round(rows.reduce((n, m) => n + Math.max(0, Number(m.quantidade) || 0), 0));
  function conta(rows: MovimentoContrato[], franquia: number, teto: number | null | undefined): ContaCredito {
    const lotes: LoteCredito[] = [];
    const eventos: { data: string; qtd?: number; competencia?: string }[] = [];
    for (let comp = `${inicio.slice(0, 7)}-01`; comp <= ate; comp = proximoMes(comp)) {
      eventos.push({ data: comp < inicio ? inicio : comp, competencia: comp });
    }
    for (const m of rows) eventos.push({ data: m.data, qtd: Math.max(0, Number(m.quantidade) || 0) });
    eventos.sort((a,b) => a.data.localeCompare(b.data) || Number(!a.competencia) - Number(!b.competencia));
    let excedente = 0, excedenteMes = 0;
    const expirar = (data: string) => {
      for (const l of lotes) if (l.expiraEm <= data && l.saldo > 0) { l.expirado = round(l.expirado + l.saldo); l.saldo = 0; }
    };
    for (const e of eventos) {
      expirar(e.data);
      if (e.competencia) {
        const expiraEm = [somarDias(e.competencia, c.validade_creditos_dias!), c.fim ? somarDias(c.fim,1) : '9999-12-31'].sort()[0];
        lotes.push({ competencia: e.competencia.slice(0,7), liberadoEm: e.data, expiraEm,
          concedido: franquia, saldo: franquia, consumido: 0, expirado: 0, limitado: 0 });
        expirar(e.data);
        let excesso = teto == null ? 0 : Math.max(0, round(lotes.reduce((n,l) => n+l.saldo,0) - teto));
        for (const l of lotes) { const tirar = Math.min(l.saldo, excesso); l.saldo = round(l.saldo-tirar); l.limitado = round(l.limitado+tirar); excesso = round(excesso-tirar); }
      } else {
        let restante = e.qtd!;
        for (const l of lotes) { const usar = Math.min(l.saldo, restante); l.saldo = round(l.saldo-usar); l.consumido = round(l.consumido+usar); restante = round(restante-usar); }
        excedente = round(excedente+restante);
        if (e.data >= periodo.inicio) excedenteMes = round(excedenteMes+restante);
      }
    }
    expirar(ate);
    // Contract termination stops use even if a lot's original 60-day validity is later.
    if (c.fim && corte > c.fim) expirar('9999-12-31');
    return { saldo: round(lotes.reduce((n,l)=>n+l.saldo,0)), consumo: somar(rows), excedente, excedenteMes,
      expirado: round(lotes.reduce((n,l)=>n+l.expirado,0)), limitado: round(lotes.reduce((n,l)=>n+l.limitado,0)), lotes };
  }
  return {
    ate, noMes, semInicio: !c.inicio,
    diarias: conta(fee.filter(m=>m.tipo==='diaria'), Number(c.diarias_mes), c.limite_diarias_acumuladas),
    entregas: conta(entregas, Number(c.entregas_mes), c.limite_entregas_acumuladas),
    diariasMes: somar(noMes.filter(m=>m.tipo==='diaria' && m.faturamento==='mensal')),
    entregasMes: somar(entregas.filter(m=>m.data>=periodo.inicio)),
    fotosMes: somar(noMes.filter(m=>m.tipo==='entrega' && m.faturamento==='mensal' && !m.ignorar_contrato && tipoMidia(m)==='foto')),
    totalVideos: somar(videos),
    videosMes: somar(videos.filter(m=>m.data>=periodo.inicio)),
    totalFotos: somar(fee.filter(m=>m.tipo==='entrega' && tipoMidia(m)==='foto')),
    pendentes: fee.filter(m=>m.tipo==='entrega' && tipoMidia(m)==='conferir'),
  };
}

/** Future allowances are a schedule, never credits available for use today. */
export function visaoGeralContrato(c: Contrato, resumo: ReturnType<typeof calcularCreditos>, corte: string) {
  const mesesEntre = (a:string,b:string) => a>b ? 0 : (Number(b.slice(0,4))-Number(a.slice(0,4)))*12 + Number(b.slice(5,7))-Number(a.slice(5,7))+1;
  const mesesTotais = c.inicio && c.fim ? mesesEntre(c.inicio,c.fim) : null;
  const mesesFuturos = c.inicio && c.fim ? mesesEntre(corte<c.inicio ? c.inicio : proximoMes(corte), c.fim) : null;
  const proximaLiberacao = mesesFuturos ? (corte<c.inicio! ? c.inicio : proximoMes(corte)) : null;
  function resumoConta(conta:ContaCredito, mensal:number) {
    const venceEm = conta.lotes.filter(l=>l.saldo>0).map(l=>l.expiraEm).sort()[0] || null;
    return {totalPrevisto:mesesTotais===null?null:round(mesesTotais*mensal),
      liberado:round(conta.lotes.reduce((s,l)=>s+l.concedido,0)),
      aLiberar:mesesFuturos===null?null:round(mesesFuturos*mensal),
      proximoVencimento:venceEm,
      venceQuantidade:round(conta.lotes.filter(l=>l.expiraEm===venceEm).reduce((s,l)=>s+l.saldo,0))};
  }
  return {mesesTotais,mesesFuturos,proximaLiberacao,diarias:resumoConta(resumo.diarias,Number(c.diarias_mes)),entregas:resumoConta(resumo.entregas,Number(c.entregas_mes))};
}
