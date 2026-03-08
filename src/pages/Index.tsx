import { DollarSign, FolderKanban, Percent, Hash } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useProjects } from "@/hooks/useProjects";
import { useContaAzulCache } from "@/hooks/useContaAzulCache";
import { formatCurrency, formatPercent } from "@/lib/format";
import { motion } from "framer-motion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer } from "recharts";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";

export default function Index() {
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: transactionsCache } = useContaAzulCache("transactions");

  const kpis = useMemo(() => {
    if (!projects) return null;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const thisYearProjects = projects.filter((p) => {
      const d = p.sold_date ? new Date(p.sold_date) : new Date(p.created_at);
      return d.getFullYear() === currentYear;
    });

    const thisMonthProjects = thisYearProjects.filter((p) => {
      const d = p.sold_date ? new Date(p.sold_date) : new Date(p.created_at);
      return d.getMonth() === currentMonth;
    });

    const receitaMes = thisMonthProjects.reduce((s, p) => s + (p.sold_value ?? 0), 0);
    const avgMargin = thisYearProjects.length > 0
      ? thisYearProjects.reduce((s, p) => s + (p.gross_margin_percent ?? 0), 0) / thisYearProjects.length
      : 0;
    const ticketMedio = thisYearProjects.length > 0
      ? thisYearProjects.reduce((s, p) => s + (p.sold_value ?? 0), 0) / thisYearProjects.length
      : 0;

    return {
      receitaMes,
      avgMargin,
      ticketMedio,
      totalProjetos: thisYearProjects.length,
    };
  }, [projects]);

  // Revenue last 6 months from projects
  const revenueChart = useMemo(() => {
    if (!projects) return [];
    const now = new Date();
    const months: { label: string; receita: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.getMonth();
      const year = d.getFullYear();
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const receita = projects
        .filter((p) => {
          const pd = p.sold_date ? new Date(p.sold_date) : new Date(p.created_at);
          return pd.getMonth() === month && pd.getFullYear() === year;
        })
        .reduce((s, p) => s + (p.sold_value ?? 0), 0);
      months.push({ label, receita });
    }
    return months;
  }, [projects]);

  // Top 5 expense categories from cache
  const expenseCategories = useMemo(() => {
    if (!transactionsCache?.payload) return [];
    try {
      const payload = transactionsCache.payload as unknown as Array<{
        category?: string;
        type?: string;
        amount?: number;
      }>;
      if (!Array.isArray(payload)) return [];
      const categories: Record<string, number> = {};
      payload
        .filter((t) => t.type === "PAYABLE" || t.type === "EXPENSE")
        .forEach((t) => {
          const cat = t.category || "Outros";
          categories[cat] = (categories[cat] || 0) + Math.abs(t.amount || 0);
        });
      return Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));
    } catch {
      return [];
    }
  }, [transactionsCache]);

  if (loadingProjects) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Visão Geral</h1>
        <p className="text-sm text-muted-foreground">Resumo financeiro da Adverse</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Receita do Mês" value={formatCurrency(kpis?.receitaMes ?? 0)} icon={DollarSign} delay={0} />
        <StatCard title="Margem Bruta Média" value={formatPercent(kpis?.avgMargin ?? 0)} icon={Percent} delay={0.1} />
        <StatCard title="Ticket Médio" value={formatCurrency(kpis?.ticketMedio ?? 0)} icon={Hash} delay={0.2} />
        <StatCard title="Projetos no Ano" value={String(kpis?.totalProjetos ?? 0)} icon={FolderKanban} delay={0.3} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Receita - Últimos 6 Meses</h2>
          {revenueChart.length > 0 ? (
            <ChartContainer config={{ receita: { label: "Receita", color: "hsl(var(--primary))" } }} className="h-[250px]">
              <LineChart data={revenueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">Sem dados de projetos ainda.</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Top 5 Categorias de Gastos</h2>
          {expenseCategories.length > 0 ? (
            <ChartContainer config={{ value: { label: "Valor", color: "hsl(var(--destructive))" } }} className="h-[250px]">
              <BarChart data={expenseCategories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
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
