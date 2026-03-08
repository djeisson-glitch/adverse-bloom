import { useMemo } from "react";
import { motion } from "framer-motion";
import { useContaAzulCache } from "@/hooks/useContaAzulCache";
import { formatCurrency } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Loader2 } from "lucide-react";

export default function FluxoDeCaixa() {
  const { data: accountsCache, isLoading: loadingAccounts } = useContaAzulCache("financial_accounts");
  const { data: receivablesCache } = useContaAzulCache("receivables");
  const { data: payablesCache } = useContaAzulCache("payables");

  const currentBalance = useMemo(() => {
    if (!accountsCache?.payload) return 0;
    try {
      const accounts = accountsCache.payload as unknown as Array<{ balance?: number }>;
      if (!Array.isArray(accounts)) return 0;
      return accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    } catch { return 0; }
  }, [accountsCache]);

  // Monthly income vs expenses (last 6 months)
  const monthlyChart = useMemo(() => {
    const now = new Date();
    const months: { label: string; entradas: number; saidas: number }[] = [];

    const parseTransactions = (cache: typeof receivablesCache, field: "entradas" | "saidas") => {
      if (!cache?.payload) return {};
      try {
        const items = cache.payload as unknown as Array<{ due_date?: string; amount?: number }>;
        if (!Array.isArray(items)) return {};
        const byMonth: Record<string, number> = {};
        items.forEach((t) => {
          if (!t.due_date) return;
          const d = new Date(t.due_date);
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          byMonth[key] = (byMonth[key] || 0) + Math.abs(t.amount || 0);
        });
        return byMonth;
      } catch { return {}; }
    };

    const incomeByMonth = parseTransactions(receivablesCache, "entradas");
    const expenseByMonth = parseTransactions(payablesCache, "saidas");

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      months.push({
        label,
        entradas: incomeByMonth[key] || 0,
        saidas: expenseByMonth[key] || 0,
      });
    }
    return months;
  }, [receivablesCache, payablesCache]);

  const avgMonthlyNet = useMemo(() => {
    if (monthlyChart.length === 0) return 0;
    const total = monthlyChart.reduce((s, m) => s + m.entradas - m.saidas, 0);
    return total / monthlyChart.length;
  }, [monthlyChart]);

  const now = new Date();
  const remainingMonths = 12 - now.getMonth();
  const projectedYearEnd = currentBalance + avgMonthlyNet * remainingMonths;
  const showAlert = projectedYearEnd < 50000;

  const totalEntradas = monthlyChart.reduce((s, m) => s + m.entradas, 0);
  const totalSaidas = monthlyChart.reduce((s, m) => s + m.saidas, 0);

  if (loadingAccounts) {
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
          }} className="h-[300px]">
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
