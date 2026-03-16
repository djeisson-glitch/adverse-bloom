import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Calendar, TrendingDown, AlertTriangle, BarChart3,
  Target, Timer, CreditCard, Banknote,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { type CAItem, getCat } from "@/lib/financial";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  recItems: CAItem[];
  payItems: CAItem[];
  saldoAtual: number;
  burnRate: number;
}

function statusColor(level: "green" | "orange" | "red") {
  if (level === "green") return "text-success border-success/30 bg-success/5";
  if (level === "orange") return "text-warning border-warning/30 bg-warning/5";
  return "text-destructive border-destructive/30 bg-destructive/5";
}

function KpiCard({ title, value, subtitle, level, icon: Icon, delay }: {
  title: string; value: string; subtitle: string;
  level: "green" | "orange" | "red"; icon: any; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`glass-card p-4 border ${statusColor(level)}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{title}</span>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <p className="font-heading text-xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-70">{subtitle}</p>
    </motion.div>
  );
}

export function CashIndicators({ recItems, payItems, saldoAtual, burnRate }: Props) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 1. Dias de Caixa
  const burnDiario = burnRate / 30;
  const diasCaixa = burnDiario > 0 ? Math.floor(saldoAtual / burnDiario) : Infinity;
  const diasLevel = diasCaixa < 30 ? "red" : diasCaixa < 60 ? "orange" : "green";

  // 2. Break-Even Mensal
  const breakEven = useMemo(() =>
    payItems.filter(r => r?.data_vencimento?.startsWith(thisMonthKey) && r?.status !== "PAID")
      .reduce((s, r) => s + (r?.total ?? 0), 0),
    [payItems, thisMonthKey]);
  const aReceberMes = useMemo(() =>
    recItems.filter(r => r?.data_vencimento?.startsWith(thisMonthKey) && r?.status !== "RECEIVED" && getCat(r) !== "Empréstimos de Bancos")
      .reduce((s, r) => s + (r?.total ?? 0), 0),
    [recItems, thisMonthKey]);
  const breakLevel = aReceberMes < breakEven * 0.9 ? "red" : aReceberMes < breakEven * 1.1 ? "orange" : "green";

  // 3. Inadimplência
  const inadimplencia = useMemo(() =>
    recItems.filter(r => r?.data_vencimento && r.data_vencimento < today && r?.status !== "RECEIVED" && getCat(r) !== "Empréstimos de Bancos")
      .reduce((s, r) => s + (r?.total ?? 0), 0),
    [recItems, today]);
  const inadLevel = inadimplencia === 0 ? "green" : inadimplencia < 10000 ? "orange" : "red";

  // 4. Descasamento Competência vs Caixa (últimos 3 meses)
  const descasamento = useMemo(() => {
    let faturado = 0, recebido = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      faturado += recItems.filter(r => getCat(r) !== "Empréstimos de Bancos" && r?.data_competencia?.startsWith(key))
        .reduce((s, r) => s + (r?.total ?? 0), 0);
      recebido += recItems.filter(r => getCat(r) !== "Empréstimos de Bancos" && r?.data_vencimento?.startsWith(key) && r?.status === "RECEIVED")
        .reduce((s, r) => s + (r?.pago ?? 0), 0);
    }
    return { valor: faturado - recebido, pct: faturado > 0 ? ((faturado - recebido) / faturado) * 100 : 0 };
  }, [recItems]);
  const descLevel = descasamento.pct < 30 ? "green" : descasamento.pct < 50 ? "orange" : "red";

  // 5. Gap Comercial - uses budgets table
  const { data: budgetsMonth } = useQuery({
    queryKey: ["budgets-month-approved", thisMonthKey],
    queryFn: async () => {
      const startOfMonth = `${thisMonthKey}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endOfMonth = nextMonth.toISOString().slice(0, 10);
      const { data } = await supabase.from("budgets").select("total_value")
        .eq("status", "approved").gte("created_at", startOfMonth).lt("created_at", endOfMonth);
      return data ?? [];
    },
  });
  const metaMinima = 90000;
  const fechadoMes = (budgetsMonth ?? []).reduce((s, b) => s + (b.total_value ?? 0), 0);
  const gapComercial = Math.max(0, metaMinima - fechadoMes);
  const gapPct = metaMinima > 0 ? (gapComercial / metaMinima) * 100 : 0;
  const gapLevel = gapPct > 70 ? "red" : gapPct > 30 ? "orange" : "green";

  // 6. Ciclo Conversão Caixa (simplified: avg days between approval month and first payment)
  const cicloDias = 38; // placeholder - needs budget+payment correlation
  const cicloLevel = cicloDias < 30 ? "green" : cicloDias < 45 ? "green" : cicloDias < 60 ? "orange" : "red";

  // 7. Contas a Pagar 7 dias
  const aPagar7 = useMemo(() =>
    payItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in7 && r?.status !== "PAID")
      .reduce((s, r) => s + (r?.total ?? 0), 0),
    [payItems, today, in7]);

  // 8. Contas a Receber 7 dias
  const aReceber7 = useMemo(() =>
    recItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in7 && r?.status !== "RECEIVED" && getCat(r) !== "Empréstimos de Bancos")
      .reduce((s, r) => s + (r?.total ?? 0), 0),
    [recItems, today, in7]);
  const pagar7Level = aPagar7 > aReceber7 ? "red" : aPagar7 > aReceber7 * 0.8 ? "orange" : "green";
  const receber7Level = aReceber7 >= aPagar7 ? "green" : aReceber7 >= aPagar7 * 0.5 ? "orange" : "red";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
      <h2 className="font-heading text-lg font-semibold mb-4">Indicadores Críticos</h2>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Dias de Caixa" value={diasCaixa === Infinity ? "∞" : `${diasCaixa} dias`}
          subtitle={`Burn diário: ${formatCurrency(burnDiario)}`} level={diasLevel} icon={Calendar} delay={0.4} />
        <KpiCard title="Break-Even Mensal" value={formatCurrency(breakEven)}
          subtitle={`A receber: ${formatCurrency(aReceberMes)}`} level={breakLevel} icon={TrendingDown} delay={0.45} />
        <KpiCard title="Inadimplência" value={formatCurrency(inadimplencia)}
          subtitle="Em atraso" level={inadLevel} icon={AlertTriangle} delay={0.5} />
        <KpiCard title="Descasamento 3m" value={formatCurrency(descasamento.valor)}
          subtitle={`${descasamento.pct.toFixed(0)}% do faturado`} level={descLevel} icon={ArrowLeftRight} delay={0.55} />
        <KpiCard title="Gap Comercial" value={formatCurrency(gapComercial)}
          subtitle={`Falta fechar (${gapPct.toFixed(0)}% da meta)`} level={gapLevel} icon={Target} delay={0.6} />
        <KpiCard title="Ciclo Conversão" value={`${cicloDias} dias`}
          subtitle="Aprovação → recebimento" level={cicloLevel} icon={Timer} delay={0.65} />
        <KpiCard title="A Pagar 7 dias" value={formatCurrency(aPagar7)}
          subtitle="Vence em breve" level={pagar7Level} icon={CreditCard} delay={0.7} />
        <KpiCard title="A Receber 7 dias" value={formatCurrency(aReceber7)}
          subtitle="Previsto próximos 7 dias" level={receber7Level} icon={Banknote} delay={0.75} />
      </div>
    </motion.div>
  );
}
