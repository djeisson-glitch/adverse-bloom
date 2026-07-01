import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeals, STAGES } from "@/hooks/useDeals";
import { usePermissions } from "@/hooks/usePermissions";
import { BarChart3, Coins, Trophy, Percent, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Link } from "react-router-dom";

/**
 * Onda 2 — Relatórios (funil + faturamento por cliente).
 * Rentabilidade por projeto vem na Onda 4 (precisa de Horas + Fechamento).
 */
export default function Relatorios() {
  const { deals } = useDeals();
  const { canSeeMoney } = usePermissions();

  const abertos = useMemo(
    () => deals.filter((d) => d.stage !== "aceite" && d.stage !== "perdido"),
    [deals],
  );
  const ganhos = useMemo(() => deals.filter((d) => d.stage === "aceite"), [deals]);
  const perdidos = useMemo(() => deals.filter((d) => d.stage === "perdido"), [deals]);
  const decididos = ganhos.length + perdidos.length;
  const taxaConversao = decididos > 0 ? Math.round((ganhos.length / decididos) * 100) : 0;
  const pipelineAberto = abertos.reduce((s, d) => s + ((d as any).approved_value ?? d.value ?? 0), 0);
  const valorGanho = ganhos.reduce((s, d) => s + ((d as any).approved_value ?? d.value ?? 0), 0);

  const porEstagio = useMemo(
    () =>
      STAGES.filter((s) => s.id !== "perdido").map((s) => ({
        stage: s,
        n: deals.filter((d) => d.stage === s.id).length,
      })),
    [deals],
  );
  const maxN = Math.max(1, ...porEstagio.map((p) => p.n));

  const porCliente = useMemo(() => {
    const map = new Map<string, { name: string; valor: number; n: number }>();
    ganhos.forEach((d) => {
      const name = d.client?.name || "Sem cliente";
      const cur = map.get(name) || { name, valor: 0, n: 0 };
      cur.valor += (d as any).approved_value ?? d.value ?? 0;
      cur.n += 1;
      map.set(name, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [ganhos]);
  const maxCliente = Math.max(1, ...porCliente.map((p) => p.valor));

  const porMes = useMemo(() => {
    const map = new Map<string, number>();
    ganhos.forEach((d) => {
      const dt = new Date(d.created_at || Date.now());
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + ((d as any).approved_value ?? d.value ?? 0));
    });
    return Array.from(map.entries())
      .sort()
      .slice(-6)
      .map(([mes, valor]) => ({ mes, valor }));
  }, [ganhos]);
  const maxMes = Math.max(1, ...porMes.map((p) => p.valor));

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Só admin e produtor têm acesso aos Relatórios.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Relatórios</h1>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi icon={Coins} label="Pipeline aberto" value={formatCurrency(pipelineAberto)} hint={`${abertos.length} orçamentos`} tone="primary" />
        <Kpi icon={Trophy} label="Ganhos" value={formatCurrency(valorGanho)} hint={`${ganhos.length} fechados`} tone="success" />
        <Kpi icon={Percent} label="Conversão" value={`${taxaConversao}%`} hint={`${ganhos.length}G · ${perdidos.length}P`} tone="warning" />
        <Kpi icon={DollarSign} label="Contas USD" value="$0.00" hint="internacional" tone="primary" />
      </div>

      {/* Funil comercial */}
      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <p className="text-sm font-medium text-foreground">Funil comercial</p>
          {porEstagio.map((row) => (
            <div key={row.stage.id} className="flex items-center gap-3">
              <span className="w-40 text-xs text-muted-foreground">
                <span className="mr-1" style={{ color: row.stage.color }}>
                  ●
                </span>
                {row.stage.label}
              </span>
              <div className="relative h-6 flex-1 rounded-md bg-muted/40">
                <div
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{
                    width: `${(row.n / maxN) * 100}%`,
                    background: row.stage.color,
                    opacity: 0.75,
                  }}
                />
              </div>
              <span className="w-8 text-right text-sm font-medium text-foreground">{row.n}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Faturamento por cliente + por mês */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass-card">
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium text-foreground">Faturamento por cliente (BRL)</p>
            {porCliente.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Sem ganhos ainda.
              </p>
            ) : (
              porCliente.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-32 truncate text-xs text-muted-foreground">{p.name}</span>
                  <div className="relative h-5 flex-1 rounded-md bg-muted/40">
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-primary/70"
                      style={{ width: `${(p.valor / maxCliente) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 text-right text-xs text-foreground">
                    {formatCurrency(p.valor)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium text-foreground">Faturamento por mês (BRL)</p>
            {porMes.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Sem ganhos ainda.</p>
            ) : (
              <div className="flex items-end justify-between gap-2 pt-2">
                {porMes.map((m) => (
                  <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                    <div className="relative w-full">
                      <div
                        className="w-full rounded-t bg-primary/70"
                        style={{ height: `${(m.valor / maxMes) * 120}px`, minHeight: 2 }}
                        title={formatCurrency(m.valor)}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.mes.slice(-2)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rentabilidade — Onda 4 (view v_rentabilidade_projeto) */}
      <RentabilidadeSection />
    </div>
  );
}

function RentabilidadeSection() {
  const { data: rows = [] } = useQuery({
    queryKey: ["relatorios-rentabilidade"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_rentabilidade_projeto")
        .select("*")
        .order("margem", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <div className="border-b border-border/50 px-5 py-3 text-sm font-medium text-foreground">
          Rentabilidade por projeto
        </div>
        <div className="grid grid-cols-[80px_1fr_80px_120px_120px_120px_100px_40px] items-center gap-2 border-b border-border/40 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>#</span>
          <span>Projeto</span>
          <span className="text-right">Horas</span>
          <span className="text-right">Valor</span>
          <span className="text-right">Custo</span>
          <span className="text-right">Margem</span>
          <span className="text-right">%</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Sem projetos com horas apontadas ainda.
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.project_id}
              className="grid grid-cols-[80px_1fr_80px_120px_120px_120px_100px_40px] items-center gap-2 border-b border-border/40 px-5 py-2 text-sm last:border-0"
            >
              <span className="font-mono text-xs text-muted-foreground">{r.numero || "—"}</span>
              <Link to={`/projetos/${r.project_id}`} className="min-w-0 hover:text-primary">
                <p className="truncate">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.client_name || "—"}</p>
              </Link>
              <span className="text-right text-xs">{Number(r.horas || 0).toFixed(1)}h</span>
              <span className="text-right">{formatCurrency(r.valor || 0)}</span>
              <span className="text-right text-xs text-muted-foreground">
                {formatCurrency(r.custo_total || 0)}
              </span>
              <span className={`text-right font-medium ${r.margem >= 0 ? "text-success" : "text-destructive"}`}>
                {formatCurrency(r.margem || 0)}
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {r.margem_percent != null ? `${Number(r.margem_percent).toFixed(0)}%` : "—"}
              </span>
              <span />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-primary/15 text-primary";
  return (
    <Card className="glass-card">
      <CardContent className="space-y-2 p-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-4 w-4" />
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
