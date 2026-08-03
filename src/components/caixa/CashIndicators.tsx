import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Calendar, TrendingDown, AlertTriangle, BarChart3,
  Target, Timer, CreditCard, Banknote,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { type CAItem, getCat, STATUS_NAO_RECEBIVEL, STATUS_NAO_PAGAVEL } from "@/lib/financial";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { dataISO, emDiasISO, hojeISO } from "@/lib/dataLocal";

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
      <p className="font-heading text-xl font-bold truncate" title={value}>{value}</p>
      <p className="text-xs mt-1 opacity-70">{subtitle}</p>
    </motion.div>
  );
}

export function CashIndicators({ recItems, payItems, saldoAtual, burnRate }: Props) {
  const now = new Date();
  const today = hojeISO();
  const in7 = emDiasISO(7);
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

  // 3. Inadimplência - SOMENTE vencidos (data_vencimento < hoje) E não recebidos, valor pendente
  const inadimplencia = useMemo(() =>
    recItems.filter(r =>
      r?.data_vencimento &&
      r.data_vencimento < today &&
      (r?.nao_pago ?? 0) > 0 &&
      !STATUS_NAO_RECEBIVEL.includes(r?.status ?? "") &&
      getCat(r) !== "Empréstimos de Bancos"
    ).reduce((s, r) => s + (r?.nao_pago ?? 0), 0),
    [recItems, today]);
  const inadLevel = inadimplencia === 0 ? "green" : inadimplencia < 10000 ? "orange" : "red";

  // 4. Faturamento vs Meta Trimestral (sazonalidade)
  const currentYear = now.getFullYear();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const qStartMonth = (currentQuarter - 1) * 3; // 0-indexed
  const qEndMonth = currentQuarter * 3; // exclusive

  // Load targets from DB
  const { data: targetRow } = useQuery({
    queryKey: ["budget-targets", currentYear],
    queryFn: async () => {
      const { data } = await supabase.from("budget_targets").select("*")
        .eq("year", currentYear).maybeSingle();
      return data;
    },
  });

  const metaAnual = targetRow?.annual_target ?? 1500000;
  const qPercents = [
    targetRow?.q1_percent ?? 25,
    targetRow?.q2_percent ?? 25,
    targetRow?.q3_percent ?? 25,
    targetRow?.q4_percent ?? 25,
  ];
  const metaTrimestre = metaAnual * (qPercents[currentQuarter - 1] / 100);

  const faturadoTrimestre = useMemo(() => {
    const yearStr = String(currentYear);
    return recItems.filter(r => {
      const dc = r?.data_competencia;
      if (!dc?.startsWith(yearStr)) return false;
      const m = Number(dc.slice(5, 7)) - 1;
      return m >= qStartMonth && m < qEndMonth && getCat(r) !== "Empréstimos de Bancos";
    }).reduce((s, r) => s + (r?.total ?? 0), 0);
  }, [recItems, currentYear, qStartMonth, qEndMonth]);

  const fatPct = metaTrimestre > 0 ? (faturadoTrimestre / metaTrimestre) * 100 : 0;
  const fatLevel = fatPct >= 100 ? "green" : fatPct >= 70 ? "orange" : "red";

  // 5. Gap Comercial
  const { data: budgetsMonth } = useQuery({
    queryKey: ["budgets-month-approved", thisMonthKey],
    queryFn: async () => {
      const startOfMonth = `${thisMonthKey}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endOfMonth = dataISO(nextMonth);
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

  // 6. Ciclo Conversão Caixa — média real de deals fechados
  const { data: cicloData } = useQuery({
    queryKey: ["ciclo-conversao"],
    queryFn: async () => {
      // Get won deals
      const { data: wonDeals } = await supabase.from("deals").select("id, created_at, updated_at")
        .eq("stage", "fechamento");
      if (!wonDeals?.length) return { ciclo: 0, count: 0 };

      // Get earliest budget creation per deal
      const dealIds = wonDeals.map(d => d.id);
      const { data: budgets } = await supabase.from("budgets").select("deal_id, created_at")
        .in("deal_id", dealIds).order("created_at", { ascending: true });

      const earliestBudget: Record<string, string> = {};
      (budgets || []).forEach(b => {
        if (b.deal_id && !earliestBudget[b.deal_id]) {
          earliestBudget[b.deal_id] = b.created_at;
        }
      });

      let totalDays = 0, count = 0;
      wonDeals.forEach(deal => {
        const closeDate = new Date(deal.updated_at!);
        // Use earliest between deal creation and budget creation
        const dealCreated = new Date(deal.created_at!);
        const budgetCreated = earliestBudget[deal.id] ? new Date(earliestBudget[deal.id]) : dealCreated;
        const startDate = budgetCreated < dealCreated ? budgetCreated : dealCreated;
        const days = Math.round((closeDate.getTime() - startDate.getTime()) / 86400000);
        if (days > 0) { totalDays += days; count++; }
      });
      return { ciclo: count > 0 ? Math.round(totalDays / count) : 0, count };
    },
  });
  const cicloDias = cicloData?.ciclo ?? 0;
  const cicloLevel = cicloDias === 0 ? "green" : cicloDias < 30 ? "green" : cicloDias < 45 ? "green" : cicloDias < 60 ? "orange" : "red";

  // 7. Contas a Pagar 7 dias
  const aPagar7 = useMemo(() =>
    payItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in7 && (r?.nao_pago ?? 0) > 0 && !STATUS_NAO_PAGAVEL.includes(r?.status ?? ""))
      .reduce((s, r) => s + (r?.nao_pago ?? 0), 0),
    [payItems, today, in7]);

  // 8. Contas a Receber 7 dias
  const aReceber7 = useMemo(() =>
    recItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in7 && (r?.nao_pago ?? 0) > 0 && !STATUS_NAO_RECEBIVEL.includes(r?.status ?? "") && getCat(r) !== "Empréstimos de Bancos")
      .reduce((s, r) => s + (r?.nao_pago ?? 0), 0),
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
        <KpiCard title="Inadimplência" value={inadimplencia === 0 ? "R$ 0 ✓" : formatCurrency(inadimplencia)}
          subtitle={inadimplencia === 0 ? "Nenhuma conta atrasada" : "Vencido e não recebido"} level={inadLevel} icon={AlertTriangle} delay={0.5} />
        <KpiCard title={`Q${currentQuarter} vs Meta`} value={formatCurrency(faturadoTrimestre)}
          subtitle={`${fatPct.toFixed(0)}% de ${formatCurrency(metaTrimestre)}`} level={fatLevel} icon={BarChart3} delay={0.55} />
        <KpiCard title="Gap Comercial" value={formatCurrency(gapComercial)}
          subtitle={`Falta fechar (${gapPct.toFixed(0)}% da meta)`} level={gapLevel} icon={Target} delay={0.6} />
        <KpiCard title="Ciclo Conversão" value={cicloDias > 0 ? `${cicloDias} dias` : "—"}
          subtitle={`Média de ${cicloData?.count ?? 0} deals fechados`} level={cicloLevel} icon={Timer} delay={0.65} />
        <KpiCard title="A Pagar 7 dias" value={formatCurrency(aPagar7)}
          subtitle="Vence em breve" level={pagar7Level} icon={CreditCard} delay={0.7} />
        <KpiCard title="A Receber 7 dias" value={formatCurrency(aReceber7)}
          subtitle="Previsto próximos 7 dias" level={receber7Level} icon={Banknote} delay={0.75} />
      </div>
    </motion.div>
  );
}
