import type { Contrato } from '@/lib/consumoContrato';
import { calcularCreditos, visaoGeralContrato, type ContaCredito } from '@/lib/creditosContrato';
import { formatDate } from '@/lib/format';
const qtd=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2});
type Props={contrato:Contrato;resumo:ReturnType<typeof calcularCreditos>;corte:string};
export default function VisaoGeralContrato({contrato:c,resumo:r,corte}:Props) {
  const geral=visaoGeralContrato(c,r,corte);
  const entregasLabel=c.franquia_entregas_tipo==='video_foto'?'Entregas · vídeos + fotos':c.franquia_entregas_tipo==='video'?'Vídeos':'Entregáveis';
  const provisorio=r.semInicio || (c.franquia_entregas_tipo!=='todos' && r.pendentes.length>0);
  return <section aria-label="Visão geral do contrato" className="space-y-3">
    <div><h3 className="text-sm font-semibold">O que ainda pode usar</h3><p className="mt-1 text-xs text-muted-foreground">Disponível em {formatDate(corte)}{provisorio?' · saldo provisório: há dados para conferir':''}. {c.franquia_entregas_tipo==='video_foto'?'Vídeos e entregas de fotos usam a mesma franquia. Uma entrega de fotos conta como 1, independentemente da quantidade de imagens.':''}</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Disponivel titulo="Diárias de captação" conta={r.diarias} geral={geral.diarias} usadasMes={r.diariasMes} mensal={Number(c.diarias_mes)}/>
      <Disponivel titulo={entregasLabel} conta={r.entregas} geral={geral.entregas} usadasMes={r.entregasMes} mensal={Number(c.entregas_mes)}/>
    </div>
    <div className="rounded-lg border px-4 py-3 text-xs"><p className="font-medium">Composição das entregas no fee</p><div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground"><span>Vídeos: <b className="text-foreground">{qtd(r.videosMes)}</b> no mês · {qtd(r.totalVideos)} no contrato</span><span>Entregas de fotos: <b className="text-foreground">{qtd(r.fotosMes)}</b> no mês · {qtd(r.totalFotos)} no contrato</span></div><p className="mt-2 text-muted-foreground">Registros até {formatDate(r.ate)}, inclusive peças em produção. {c.franquia_entregas_tipo==='video'?'Fotos não descontam a franquia de vídeos.':''}</p></div>
    <div className="rounded-lg border p-4"><h4 className="text-sm font-semibold">Visão do contrato completo</h4><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr>{['Franquia','Total previsto','Já liberado','Usado','A liberar'].map(t=><th key={t} className="py-2 pr-4 font-normal">{t}</th>)}</tr></thead><tbody>{[{nome:'Diárias',info:geral.diarias,conta:r.diarias},{nome:entregasLabel,info:geral.entregas,conta:r.entregas}].map(l=><tr key={l.nome} className="border-t"><th className="py-3 pr-4 font-medium">{l.nome}</th>{[l.info.totalPrevisto,l.info.liberado,l.conta.consumo,l.info.aLiberar].map((n,i)=><td key={i} className="py-3 pr-4">{n===null?'Não definido':qtd(n)}</td>)}</tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">{geral.proximaLiberacao?`Próxima liberação em ${formatDate(geral.proximaLiberacao)}: ${qtd(Number(c.diarias_mes))} diária(s) e ${qtd(Number(c.entregas_mes))} entrega(s). `:''}As franquias futuras são liberadas mês a mês e não estão disponíveis agora. Créditos vencidos ou retirados pelo teto não ficam disponíveis. Consulte o extrato abaixo.</p></div>
  </section>;
}
function Disponivel({titulo,conta,geral,usadasMes,mensal}:{titulo:string;conta:ContaCredito;geral:ReturnType<typeof visaoGeralContrato>['diarias'];usadasMes:number;mensal:number}) {
  return <div className="rounded-xl border bg-card p-4"><p className="text-sm font-medium">{titulo}</p><p className="mt-3 text-3xl font-semibold">{qtd(conta.saldo)} <span className="text-xs font-normal text-muted-foreground">disponíveis agora</span></p><p className="mt-2 text-xs text-muted-foreground">{qtd(usadasMes)} usados no mês · franquia mensal {qtd(mensal)}</p>{geral.proximoVencimento && <p className="mt-2 text-xs text-warning">{qtd(geral.venceQuantidade)} expira(m) em {formatDate(geral.proximoVencimento)}</p>}{conta.excedenteMes>0 && <p className="mt-2 text-sm text-destructive">{qtd(conta.excedenteMes)} sem crédito no mês</p>}{conta.excedente>0 && <p className="mt-1 text-xs text-muted-foreground">{qtd(conta.excedente)} sem crédito no histórico · sujeito a conferência</p>}</div>;
}
