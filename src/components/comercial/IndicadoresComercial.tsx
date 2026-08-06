import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Trophy, XCircle, Percent, Timer, Target, Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFiltro } from "@/hooks/useFiltro";
import { isWonStage } from "@/hooks/useDeals";

/**
 * Indicadores do comercial — com o tamanho da amostra à vista.
 *
 * Taxa de conversão sobre 3 negócios decididos é ruído com cara de KPI. A
 * regra desta tela: todo número diz de quantos casos ele saiu, e o que a base
 * ainda não sustenta aparece como "—" em vez de um valor bonito e falso.
 *
 * "Orçamentos enviados" usa `proposta_em`, gravado por trigger desde 06/08.
 * Quem já estava adiante no funil não tem essa data — e a tela avisa quantos
 * são, em vez de somar tudo e chamar de mês.
 */

const PERIODOS = [
  { id: "30", label: "Últimos 30 dias", dias: 30 },
  { id: "90", label: "Últimos 90 dias", dias: 90 },
  { id: "365", label: "Últimos 12 meses", dias: 365 },
  { id: "tudo", label: "Desde o início", dias: 99999 },
];

type Deal = {
  id: string; stage: string; value?: number | null; approved_value?: number | null;
  created_at?: string | null; proposta_em?: string | null;
  won_at?: string | null; lost_at?: string | null;
};

export function IndicadoresComercial({ deals, meta }: { deals: Deal[]; meta?: number | null }) {
  const [periodo, setPeriodo] = useFiltro<string>("periodo", "90", "orcamentos");

  const m = useMemo(() => {
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 90;
    const corte = new Date(Date.now() - dias * 86400000);
    const dentro = (iso?: string | null) => !!iso && new Date(iso) >= corte;
    const valor = (d: Deal) => Number(d.approved_value ?? d.value ?? 0);

    const enviados = deals.filter((d) => dentro(d.proposta_em));
    const ganhos = deals.filter((d) => dentro(d.won_at));
    const perdidos = deals.filter((d) => dentro(d.lost_at));
    const decididos = ganhos.length + perdidos.length;

    // Ciclo: da criação até a decisão. Só de quem tem as duas pontas.
    const ciclos = [...ganhos, ...perdidos]
      .map((d) => {
        const fim = d.won_at || d.lost_at;
        if (!fim || !d.created_at) return null;
        const dd = Math.round((new Date(fim).getTime() - new Date(d.created_at).getTime()) / 86400000);
        return dd >= 0 ? dd : null;
      })
      .filter((x): x is number => x !== null);
    const ciclo = ciclos.length ? Math.round(ciclos.reduce((s, x) => s + x, 0) / ciclos.length) : null;

    // Sem a data de envio: são os que já estavam adiante quando a coluna
    // nasceu. Contá-los como "enviados hoje" inflaria o indicador.
    const semData = deals.filter(
      (d) => !d.proposta_em && ["proposta", "negociacao", "aceite", "fechado_ganho", "perdido"].includes(d.stage),
    ).length;

    const abertos = deals.filter((d) => !isWonStage(d.stage) && d.stage !== "perdido");

    return {
      enviados: enviados.length,
      valorEnviado: enviados.reduce((s, d) => s + valor(d), 0),
      ganhos: ganhos.length,
      valorGanho: ganhos.reduce((s, d) => s + valor(d), 0),
      perdidos: perdidos.length,
      valorPerdido: perdidos.reduce((s, d) => s + valor(d), 0),
      decididos,
      // Conversão pede pelo menos 5 decisões pra não virar 100% em cima de 1.
      conversao: decididos >= 5 ? Math.round((ganhos.length / decididos) * 100) : null,
      ciclo, amostraCiclo: ciclos.length,
      semData,
      pipeline: abertos.reduce((s, d) => s + valor(d), 0),
    };
  }, [deals, periodo]);

  const metaValor = Number(meta || 0);
  const pctMeta = metaValor > 0 ? Math.round((m.valorGanho / metaValor) * 100) : null;

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Indicadores do comercial</p>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi icon={Send} rot="Enviados" v={String(m.enviados)} sub={m.valorEnviado > 0 ? formatCurrency(m.valorEnviado) : undefined} />
          <Kpi icon={Trophy} rot="Ganhos" v={String(m.ganhos)} sub={m.valorGanho > 0 ? formatCurrency(m.valorGanho) : undefined} tom="success" />
          <Kpi icon={XCircle} rot="Perdidos" v={String(m.perdidos)} sub={m.valorPerdido > 0 ? formatCurrency(m.valorPerdido) : undefined} tom="destructive" />
          <Kpi
            icon={Percent} rot="Conversão"
            v={m.conversao != null ? `${m.conversao}%` : "—"}
            sub={m.conversao != null ? `${m.ganhos} de ${m.decididos}` : `${m.decididos} decidido${m.decididos === 1 ? "" : "s"} — precisa de 5`}
          />
          <Kpi
            icon={Timer} rot="Ciclo médio"
            v={m.ciclo != null ? `${m.ciclo}d` : "—"}
            sub={m.amostraCiclo > 0 ? `${m.amostraCiclo} negócio${m.amostraCiclo === 1 ? "" : "s"}` : "sem decisão no período"}
          />
          <Kpi
            icon={Target} rot="Meta do mês"
            v={metaValor > 0 ? formatCurrency(metaValor) : "—"}
            sub={pctMeta != null ? `${pctMeta}% atingido` : "defina em Ajustes"}
          />
        </div>

        {/* O buraco declarado. Some sozinho conforme os novos orçamentos
            passarem pelo funil com a data já sendo gravada. */}
        {m.semData > 0 && (
          <p className="flex items-start gap-1.5 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              <strong className="text-foreground">{m.semData}</strong>{" "}
              {m.semData === 1 ? "orçamento já estava" : "orçamentos já estavam"} adiante no funil quando a data
              de envio passou a ser registrada (06/08/2026) — {m.semData === 1 ? "ele não entra" : "eles não entram"} em
              "Enviados". Ganhos, perdidos e ciclo não dependem dessa data.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ icon: Icon, rot, v, sub, tom }: {
  icon: React.ComponentType<{ className?: string }>;
  rot: string; v: string; sub?: string; tom?: "success" | "destructive";
}) {
  const cor = tom === "success" ? "text-success" : tom === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="min-w-0 rounded-lg border border-border/40 bg-muted/10 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {rot}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${cor}`}>{v}</p>
      {sub && <p className="truncate text-[10px] text-muted-foreground" title={sub}>{sub}</p>}
    </div>
  );
}
