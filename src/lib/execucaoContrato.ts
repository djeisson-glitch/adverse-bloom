import type { Contrato, MovimentoContrato } from './consumoContrato';
import { consomeFranquia, tipoMidia } from './midiaContrato';

const somar = (rows: MovimentoContrato[]) => rows.reduce((n, m) => n + Math.max(0, Number(m.quantidade) || 0), 0);
const round = (n: number) => Math.round(n * 10000) / 10000;
// "aprovado" é o estado final legado; "pronto" é só aprovação interna.
const concluida = (m: MovimentoContrato) => ['entregue', 'aprovado'].includes(m.status);

/** Execução atual de toda a vigência. Independente do mês e do saldo de créditos. */
export function execucaoContrato(c: Contrato, movimentos: MovimentoContrato[], hoje: string) {
  const meses = c.inicio && c.fim ? Math.max(0,
    (Number(c.fim.slice(0, 4)) - Number(c.inicio.slice(0, 4))) * 12 +
    Number(c.fim.slice(5, 7)) - Number(c.inicio.slice(5, 7)) + 1) : null;
  const fee = movimentos.filter(m => m.faturamento === 'mensal' && !m.ignorar_contrato &&
    (!c.inicio || m.data >= c.inicio) && (!c.fim || m.data <= c.fim) && m.data <= hoje &&
    !['cancelado', 'cancelada', 'reprovado', 'arquivado'].includes(m.status));
  const pecas = fee.filter(m => m.tipo === 'entrega' && (!m.tipo_registro || m.tipo_registro === 'entregavel'));
  const finalizadas = pecas.filter(concluida);
  const entregues = finalizadas.filter(m => consomeFranquia(c.franquia_entregas_tipo, m));
  const pendentes = finalizadas.filter(m => c.franquia_entregas_tipo !== 'todos' && tipoMidia(m) === 'conferir');
  const diariasRealizadas = round(fee.filter(m => m.tipo === 'diaria').reduce((n, m) => n +
    Math.max(0, Number(m.quantidade_realizada ?? (m.status === 'realizada' ? m.quantidade : 0)) || 0), 0));
  const conta = (mensal: number, realizado: number) => {
    const total = meses === null ? null : round(meses * Number(mensal));
    return { total, realizado, restante: total === null ? null : round(Math.max(0, total - realizado)),
      excedente: total === null ? 0 : round(Math.max(0, realizado - total)) };
  };
  return {
    meses, semVigencia: meses === null, pendentes,
    diarias: conta(c.diarias_mes, diariasRealizadas),
    entregas: conta(c.entregas_mes, round(somar(entregues))),
    videos: somar(entregues.filter(m => tipoMidia(m) === 'video')),
    fotos: somar(entregues.filter(m => tipoMidia(m) === 'foto')),
    emAndamento: somar(pecas.filter(m => !concluida(m) && consomeFranquia(c.franquia_entregas_tipo, m))),
  };
}
