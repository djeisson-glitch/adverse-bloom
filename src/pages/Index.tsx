import { DollarSign, Wallet, ArrowDownLeft, CheckCircle, Receipt, CreditCard } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useProjects } from "@/hooks/useProjects";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency } from "@/lib/format";
import { motion } from "framer-motion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PeriodFilter, type PeriodRange } from "@/components/PeriodFilter";

const SALDO_INICIAL = 16307.73;
const SALDO_INICIAL_DATA = "2025-01-07";

interface CAItem {
  total?: number;
  pago?: number;
  status?: string;
  data_vencimento?: string;
  data_competencia?: string;
  categorias?: { nome?: string }[];
  cliente?: { nome?: string };
}

function isInRange(dateStr: string | undefined, range: PeriodRange): boolean {
  if (!dateStr) return false;
  return dateStr >= range.from && dateStr <= range.to;
}

export default function Index() {
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { accounts, receivables, payables } = useAllContaAzulCache();

  const [period, setPeriod] = useState<PeriodRange>(() => {
    const now = new Date();
    const pm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastDay = new Date(py, pm + 1, 0).getDate();
    return { from: `${py}-${String(pm + 1).padStart(2, "0")}-01`, to: `${py}-${String(pm + 1).padStart(2, "0")}-${lastDay}` };
  });

  const recItems = useMemo(() => {
    const items = extractItems<CAItem>(receivables.data?.payload);
    console.log(`[Dashboard] Receivables loaded: ${items.length} items`);
    return items;
  }, [receivables.data]);
  const payItems = useMemo(() => {
    const items = extractItems<CAItem>(payables.data?.payload);
    console.log(`[Dashboard] Payables loaded: ${items.length} items`);
    return items;
  }, [payables.data]);

  // KPI 1: Receita do Período - sum total, data_vencimento in period, all statuses
  const receitaPeriodo = useMemo(() =>
    recItems.filter(r => isInRange(r?.data_vencimento, period)).reduce((s, r) => s + (r?.total ?? 0), 0),
    [recItems, period]);

  // KPI 2: Recebido - sum pago, data_vencimento in period, ACQUITTED
  const recebidoPeriodo = useMemo(() =>
    recItems.filter(r => isInRange(r?.data_vencimento, period) && r?.status === "ACQUITTED").reduce((s, r) => s + (r?.pago ?? 0), 0),
    [recItems, period]);

  // KPI 3: Faturamento - sum total, data_competencia in period, all statuses
  const faturamentoPeriodo = useMemo(() =>
    recItems.filter(r => isInRange(r?.data_competencia, period)).reduce((s, r) => s + (r?.total ?? 0), 0),
    [recItems, period]);

  // KPI 4: A Receber - PENDING, no period filter
  const aReceber = useMemo(() =>
    recItems.filter(r => r?.status === "PENDING").reduce((s, r) => s + (r?.total ?? 0), 0),
    [recItems]);

  // KPI 5: Despesas do Período - sum total, data_vencimento in period, all statuses
  const despesasPeriodo = useMemo(() =>
    payItems.filter(r => isInRange(r?.data_vencimento, period)).reduce((s, r) => s + (r?.total ?? 0), 0),
    [payItems, period]);

  // KPI 6: Pago no Período - sum pago, data_vencimento in period, ACQUITTED
  const pagoPeriodo = useMemo(() =>
    payItems.filter(r => isInRange(r?.data_vencimento, period) && r?.status === "ACQUITTED").reduce((s, r) => s + (r?.pago ?? 0), 0),
    [payItems, period]);

  // KPI 7: Saldo em Conta = saldo_inicial + recebido desde ref - pago desde ref
  const saldoEmConta = useMemo(() => {
    const recebidoDesdeRef = recItems
      .filter(r => r?.status === "ACQUITTED" && r?.data_vencimento && r.data_vencimento >= SALDO_INICIAL_DATA)
      .reduce((s, r) => s + (r?.pago ?? 0), 0);
    const pagoDesdeRef = payItems
      .filter(r => r?.status === "ACQUITTED" && r?.data_vencimento && r.data_vencimento >= SALDO_INICIAL_DATA)
      .reduce((s, r) => s + (r?.pago ?? 0), 0);
    return SALDO_INICIAL + recebidoDesdeRef - pagoDesdeRef;
  }, [recItems, payItems]);

  // Fluxo chart: always last 6 months
  const fluxoChart = useMemo(() => {
    const now = new Date();
    const months: { label: string; recebido: number; faturado: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

      const recebido = recItems
        .filter(r => r?.data_vencimento?.startsWith(key) && r?.status === "ACQUITTED")
        .reduce((s, r) => s + (r?.pago ?? 0), 0);

      const faturado = recItems
        .filter(r => r?.data_competencia?.startsWith(key))
        .reduce((s, r) => s + (r?.total ?? 0), 0);

      months.push({ label, recebido, faturado });
    }
    return months;
  }, [recItems]);

  // Top 5 categorias filtered by period using data_vencimento
  const expenseCategories = useMemo(() => {
    const filtered = payItems.filter(r => isInRange(r?.data_vencimento, period));
    const byCategory: Record<string, number> = {};
    filtered.forEach(item => {
      const catName = item?.categorias?.[0]?.nome || "Outros";
      byCategory[catName] = (byCategory[catName] || 0) + Math.abs(item?.total ?? 0);
    });
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [payItems, period]);

  const hasFluxoData = fluxoChart.some(m => m.recebido > 0 || m.faturado > 0);

  if (loadingProjects) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Visão Geral</h1>
          <p className="text-sm text-muted-foreground">Resumo financeiro da Adverse</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard title="Receita do Período" value={formatCurrency(receitaPeriodo)} icon={DollarSign} delay={0} />
        <StatCard title="Recebido" value={formatCurrency(recebidoPeriodo)} icon={CheckCircle} delay={0.05} />
        <StatCard title="Faturamento" value={formatCurrency(faturamentoPeriodo)} icon={Receipt} delay={0.1} />
        <StatCard title="A Receber" value={formatCurrency(aReceber)} icon={ArrowDownLeft} delay={0.15} />
        <StatCard title="Despesas do Período" value={formatCurrency(despesasPeriodo)} icon={Wallet} delay={0.2} />
        <StatCard title="Pago no Período" value={formatCurrency(pagoPeriodo)} icon={CreditCard} delay={0.25} />
        <StatCard title="Saldo em Conta" value={formatCurrency(saldoEmConta)} icon={Wallet} delay={0.3} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Fluxo de Caixa - Últimos 6 Meses</h2>
          {hasFluxoData ? (
            <ChartContainer config={{
              recebido: { label: "Recebido (Caixa)", color: "hsl(var(--success))" },
              faturado: { label: "Faturado (Competência)", color: "hsl(var(--primary))" },
            }} className="h-[280px]">
              <LineChart data={fluxoChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line type="monotone" dataKey="recebido" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: "hsl(var(--success))" }} />
                <Line type="monotone" dataKey="faturado" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">Sincronize os dados do Conta Azul para ver o fluxo.</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Top 5 Categorias de Gastos</h2>
          {expenseCategories.length > 0 ? (
            <ChartContainer config={{ value: { label: "Valor", color: "hsl(var(--destructive))" } }} className="h-[280px]">
              <BarChart data={expenseCategories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">Sincronize os dados do Conta Azul para ver os gastos.</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}