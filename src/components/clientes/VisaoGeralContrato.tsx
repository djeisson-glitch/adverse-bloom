import type { Contrato } from '@/lib/consumoContrato';
import type { execucaoContrato } from '@/lib/execucaoContrato';
import { formatDate } from '@/lib/format';

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
type Execucao = ReturnType<typeof execucaoContrato>;
type Props = { contrato: Contrato; execucao: Execucao; hoje: string };

export default function VisaoGeralContrato({ contrato: c, execucao: r, hoje }: Props) {
  return <section aria-label="Visão geral do contrato" className="space-y-3">
    <div>
      <h3 className="text-sm font-semibold">O que falta cumprir no contrato</h3>
      <p className="mt-1 text-xs text-muted-foreground">Total contratado menos o que já foi concluído · posição atual em {formatDate(hoje)}.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <SaldoTotal titulo={c.franquia_entregas_tipo === 'video_foto' ? 'Entregas · vídeos + fotos' : c.franquia_entregas_tipo === 'video' ? 'Vídeos' : 'Entregáveis'} conta={r.entregas} unidade="entregas" realizado="Já entregues" pendente={r.pendentes.length > 0} />
      <SaldoTotal titulo="Diárias de captação" conta={r.diarias} unidade="diárias" realizado="Já realizadas" />
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <span>Concluídos: <b className="text-foreground">{qtd(r.videos)} vídeos</b> e <b className="text-foreground">{qtd(r.fotos)} entregas de fotos</b></span>
      {r.emAndamento > 0 && <span>{qtd(r.emAndamento)} entregas em andamento · ainda não descontadas</span>}
    </div>
    <p className="text-xs text-muted-foreground">{c.franquia_entregas_tipo === 'video_foto' ? 'Cada vídeo ou entrega de fotos conta como 1. ' : ''}Apenas peças entregues ou aprovadas e diárias marcadas como realizadas descontam deste total. Trabalhos à parte não entram.</p>
    {r.semVigencia && <p className="text-xs text-warning">Informe início e fim da vigência para calcular o total contratado.</p>}
    <p className="text-xs text-muted-foreground">Este é o acompanhamento do contrato inteiro. O detalhamento mensal e a validade dos créditos ficam abaixo.</p>
  </section>;
}

function SaldoTotal({ titulo, conta, unidade, realizado, pendente = false }: {
  titulo: string; conta: Execucao['entregas']; unidade: string; realizado: string; pendente?: boolean;
}) {
  return <div className="rounded-xl border bg-card p-4">
    <p className="text-sm font-medium">{titulo}</p>
    <p className="mt-3 text-3xl font-semibold">{conta.restante === null ? '—' : qtd(conta.restante)} <span className="text-xs font-normal text-muted-foreground">{unidade} restantes{pendente ? ' · provisório' : ''}</span></p>
    <div className="mt-4 flex justify-between gap-4 text-xs text-muted-foreground">
      <span>Total contratado <b className="ml-1 text-foreground">{conta.total === null ? 'Não definido' : qtd(conta.total)}</b></span>
      <span>{realizado} <b className="ml-1 text-foreground">{qtd(conta.realizado)}</b></span>
    </div>
    {conta.total !== null && <div className="mt-3 h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-label={`${titulo}: concluído`} aria-valuemin={0} aria-valuemax={conta.total || 1} aria-valuenow={Math.min(conta.realizado, conta.total || 1)}><div className="h-full bg-primary" style={{ width: `${conta.total > 0 ? Math.min(100, conta.realizado / conta.total * 100) : 0}%` }} /></div>}
    {conta.excedente > 0 && <p className="mt-2 text-xs text-warning">{qtd(conta.excedente)} além do total contratado</p>}
  </div>;
}
