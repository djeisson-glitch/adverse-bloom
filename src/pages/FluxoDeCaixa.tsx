import { useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Loader2 } from "lucide-react";

interface CAItem {
  total?: number;
  pago?: number;
  status?: string;
  data_vencimento?: string;
}

export default function FluxoDeCaixa() {
  const { receivables, payables } = useAllContaAzulCache();

  useEffect(() => {
    if (receivables.data?.payload) console.log("[FluxoDeCaixa] receivables raw:", receivables.data.payload);
    if (payables.data?.payload) console.log("[FluxoDeCaixa] payables raw:", payables.data.payload);
  }, [receivables.data, payables.data]);

  // Saldo: receivables totais.pago.valor - payables totais.pago.valor
  const currentBalance = useMemo(() => {
    const recTotal = (receivables.data?.payload as any)?.totais?.pago?.valor ?? 0;
    const payTotal = (payables.data?.payload as any)?.totais?.pago?.valor ?? 0;
    return recTotal - payTotal;
  }, [receivables.data, payables.data]);

  // Monthly chart: last 6 months, ACQUITTED only, sum pago
  const monthlyChart = useMemo(() => {
    const now = new Date();
    const months: { label: string; entradas: number; saidas: number }[] = [];

    const groupByMonth = (payload: unknown) => {
      const items = extractItems<CAItem>(payload);
      const byMonth: Record<string, number> = {};
      items.forEach((t) => {
        if (!t?.data_vencimento || t?.status !== "ACQUITTED") return;
        const d = new Date(t.data_vencimento);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        byMonth[key] = (byMonth[key] || 0) + (t?.pago ?? 0);
      });
      return byMonth;
    };

    const incomeByMonth = groupByMonth(receivables.data?.payload);
    const expenseByMonth = groupByMonth(payables.data?.payload);

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      months.push({ label, entradas: incomeByMonth[key] || 0, saidas: expenseByMonth[key] || 0 });
    }
    return months;
  }, [receivables.data, payables.data]);

  const avgMonthlyNet = useMemo(() => {
    if (monthlyChart.length === 0) return 0;
    return monthlyChart.reduce((s, m) => s + m.entradas - m.saidas, 0) / monthlyChart.length;
  }, [monthlyChart]);

  const now = new Date();
  const remainingMonths = 12 - now.getMonth();
  const projectedYearEnd = currentBalance + avgMonthlyNet * remainingMonths;
  const showAlert = projectedYearEnd < 50000;

  const totalEntradas = monthlyChart.reduce((s, m) => s + m.entradas, 0);
  const totalSaidas = monthlyChart.reduce((s, m) => s + m.saidas, 0);

  if (receivables.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Fluxo de Caixa</h1>
        <p className="text-sm text-muted-foreground">Visão financeira consolidada</p>
      </div>

      {showAlert && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium text-warning">Atenção: Projeção de fim de ano abaixo de R$ 50.000</p>
            <p className="text-xs text-muted-foreground">Saldo projetado: {formatCurrency(projectedYearEnd)}</p>
          </div>
        </motion.div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Saldo Atual" value={formatCurrency(currentBalance)} icon={Wallet} delay={0} />
        <StatCard title="Entradas (6m)" value={formatCurrency(totalEntradas)} icon={TrendingUp} delay={0.1} changeType="positive" />
        <StatCard title="Saídas (6m)" value={formatCurrency(totalSaidas)} icon={TrendingDown} delay={0.2} changeType="negative" />
        <StatCard title="Projeção Fim do Ano" value={formatCurrency(projectedYearEnd)} icon={TrendingUp} delay={0.3} changeType={projectedYearEnd >= 50000 ? "positive" : "negative"} />
      </div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Entradas vs Saídas - Últimos 6 Meses</h2>
        {totalEntradas > 0 || totalSaidas > 0 ? (
          <ChartContainer config={{
            entradas: { label: "Entradas", color: "hsl(var(--success))" },
            saidas: { label: "Saídas", color: "hsl(var(--destructive))" },
          }} className="h-[300px] w-full">
            <BarChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="entradas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-10 text-center">Sincronize os dados do Conta Azul para visualizar o fluxo de caixa.</p>
        )}
      </motion.div>
    </div>
  );
}
