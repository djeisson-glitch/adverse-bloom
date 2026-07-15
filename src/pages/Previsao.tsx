import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeals, STAGES, isWonStage } from "@/hooks/useDeals";
import { usePermissions } from "@/hooks/usePermissions";
import { TrendingUp, Coins, Clock, Gauge, Radar, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

/**
 * Onda 2 — Previsão.
 * Pipeline aberto ponderado × capacidade livre próximas 6 semanas.
 * Regra Catalunya: valor ponderado = Σ(deal.value × probabilidade_do_stage / 100).
 * Horas esperadas assumem taxa média R$/h — override futuro na Onda 4.
 */

const R_HORA_MEDIO = 150; // base pra converter valor em horas até termos rate_card_medio ao vivo

export default function Previsao() {
  const { deals } = useDeals();
  const { canSeeMoney } = usePermissions();

  const { data: capacidade = 0 } = useQuery({
    queryKey: ["previsao-capacidade"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("horas_semana, ativo");
      if (error) throw error;
      const semanal = (data || [])
        .filter((p: any) => p.ativo !== false)
        .reduce((sum: number, p: any) => sum + (p.horas_semana ?? 40), 0);
      return semanal * 6; // 6 semanas
    },
  });

  const porEstagio = useMemo(() => {
    return STAGES.filter((s) => s.id !== "perdido" && !isWonStage(s.id)).map((s) => {
      const deals_ = deals.filter((d) => d.stage === s.id);
      const valor = deals_.reduce((acc, d) => acc + ((d as any).approved_value ?? d.value ?? 0), 0);
      const ponderado = valor * (s.probability / 100);
      const horasPonderadas = ponderado / R_HORA_MEDIO;
      return { stage: s, n: deals_.length, valor, ponderado, horasPonderadas };
    });
  }, [deals]);

  const totalPonderado = porEstagio.reduce((s, p) => s + p.ponderado, 0);
  const totalValor = porEstagio.reduce((s, p) => s + p.valor, 0);
  const horasEsperadas = totalPonderado / R_HORA_MEDIO;
  const horasPotenciais = totalValor / R_HORA_MEDIO;
  const razao = capacidade > 0 ? horasEsperadas / capacidade : 0;
  const cabe = horasEsperadas <= capacidade;

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Disponível só para quem tem acesso ao financeiro à Previsão.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Previsão</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline ponderado (orçamentos abertos × probabilidade) projetando receita e carga vs.
            capacidade livre das próximas 6 semanas.
          </p>
        </div>
      </div>

      {/* 4 KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          icon={Coins}
          label="Receita esperada"
          value={formatCurrency(totalPonderado)}
          hint={`potencial ${formatCurrency(totalValor)}`}
        />
        <KpiCard
          icon={Clock}
          label="Horas esperadas"
          value={`${Math.round(horasEsperadas)}h`}
          hint={`potencial ${Math.round(horasPotenciais)}h`}
        />
        <KpiCard
          icon={Gauge}
          label="Capacidade livre"
          value={`${capacidade}h`}
          hint="6 semanas"
        />
        <KpiCard
          icon={Radar}
          label="Demanda / capacidade"
          value={capacidade > 0 ? `${Math.round(razao * 100)}%` : "—"}
          hint="esperada vs. livre"
        />
      </div>

      {/* Alerta */}
      <Card className={`border ${cabe ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
        <CardContent className="flex items-center gap-3 p-4 text-sm">
          {cabe ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          )}
          {cabe ? (
            <span>
              A demanda <strong>esperada</strong> ({Math.round(horasEsperadas)}h) cabe na capacidade
              livre ({capacidade}h) das próximas 6 semanas. Há espaço pra vender mais{" "}
              <strong>~{Math.max(0, Math.round(capacidade - horasEsperadas))}h</strong>.
            </span>
          ) : (
            <span>
              A demanda esperada ({Math.round(horasEsperadas)}h) <strong>estoura</strong> a capacidade
              livre ({capacidade}h). Overflow de{" "}
              <strong>~{Math.round(horasEsperadas - capacidade)}h</strong> — considere contratar freela
              ou renegociar prazos.
            </span>
          )}
        </CardContent>
      </Card>

      {/* Por estágio */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Por estágio
          </div>
          <div className="grid grid-cols-[1.4fr_80px_60px_140px_140px_100px] items-center gap-2 border-b border-border/40 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Estágio</span>
            <span>Prob.</span>
            <span>Nº</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Ponderado</span>
            <span className="text-right">Horas (pond.)</span>
          </div>
          {porEstagio.map((row) => (
            <div
              key={row.stage.id}
              className="grid grid-cols-[1.4fr_80px_60px_140px_140px_100px] items-center gap-2 border-b border-border/40 px-5 py-3 last:border-0"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <span style={{ color: row.stage.color }}>●</span>
                {row.stage.label}
              </span>
              <span className="text-xs text-muted-foreground">{row.stage.probability}%</span>
              <span className="text-sm">{row.n}</span>
              <span className="text-right text-sm">{formatCurrency(row.valor)}</span>
              <span className="text-right text-sm font-medium text-primary">
                {formatCurrency(row.ponderado)}
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {Math.round(row.horasPonderadas)}h
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Probabilidades por estágio vêm do funil (lead 10% · elaboração 40% · proposta 60% · negociação
        80% · aceite 100%). Horas estimadas usam R${R_HORA_MEDIO}/h como taxa média — quando a Onda 4
        entregar Horas/Fechamento, essa taxa passa a vir da média real por função.
      </p>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="space-y-2 p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
