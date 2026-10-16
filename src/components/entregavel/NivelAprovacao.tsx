import { CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { normalizarStatusEntregavel } from "@/lib/statusEntregavel";

export function AprovacaoInterna({ entregavel, aprovador, autor }: {
  entregavel: { status: string; aprovado_n1_em?: string | null; rev_n1_ajuste?: boolean | null };
  aprovador: string;
  autor: string;
}) {
  const aguardando = normalizarStatusEntregavel(entregavel.status) === "revisao_n1";
  // O carimbo da rodada anterior é histórico, não aprovação da versão atual.
  const aprovada = ["pronto", "com_cliente", "aprovado", "entregue", "faturado"].includes(entregavel.status);
  return <NivelAprovacao label="Interna" aguardando={aguardando}
    ok={aprovada && !!entregavel.aprovado_n1_em}
    pediuAjuste={!aprovada && (entregavel.status === "ajuste_interno" || !!entregavel.rev_n1_ajuste)}
    quem={aguardando ? aprovador : autor} />;
}

export function NivelAprovacao({ ok, pediuAjuste = false, aguardando = false, label, quem }: {
  ok: boolean; pediuAjuste?: boolean; aguardando?: boolean; label: string; quem: string;
}) {
  const cor = aguardando || pediuAjuste ? "bg-warning/15 text-warning" : ok ? "bg-success/15 text-success" : "bg-muted/50 text-muted-foreground";
  const Icon = aguardando ? Clock : pediuAjuste ? RefreshCw : ok ? CheckCircle2 : Clock;
  return <span title={aguardando ? "Aguardando aprovação" : undefined} className={`flex items-center gap-1 rounded-md px-2 py-0.5 ${cor}`}>
    <Icon className="h-3 w-3" />{label}
    {aguardando ? <span className="opacity-80">· {quem === "—" ? "aguardando" : quem}</span>
      : pediuAjuste ? <span className="opacity-80">· pediu ajuste{quem !== "—" ? ` (${quem})` : ""}</span>
      : ok && <span className="opacity-70">· {quem}</span>}
  </span>;
}
