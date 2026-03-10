import { DollarSign, FolderKanban, Percent, Hash, Wallet } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useProjects } from "@/hooks/useProjects";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency, formatPercent } from "@/lib/format";
import { motion } from "framer-motion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import { useMemo, useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function Index() {
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { accounts, receivables, payables, categories } = useAllContaAzulCache();

  // Log raw payloads for inspection
  useEffect(() => {
    if (receivables.data?.payload) {
      console.log("[ContaAzul] receivables raw payload:", receivables.data.payload);
    }
    if (payables.data?.payload) {
      console.log("[ContaAzul] payables raw payload:", payables.data.payload);
    }
    if (accounts.data?.payload) {
      console.log("[ContaAzul] accounts raw payload:", accounts.data.payload);
    }
    if (categories.data?.payload) {
      console.log("[ContaAzul] categories raw payload:", categories.data.payload);
    }
  }, [receivables.data, payables.data, accounts.data, categories.data]);

  // Project-based KPIs (keep existing)
  const kpis = useMemo(() => {
    if (!projects) return null;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const thisYearProjects = projects.filter((p) => {
      if (!p.sold_date) return false;
      return new Date(p.sold_date).getFullYear() === currentYear;
    });

    const thisMonthProjects = thisYearProjects.filter((p) => {
      return new Date(p.sold_date!).getMonth() === currentMonth;
    });

    const receitaMes = thisMonthProjects.reduce((s, p) => s + (p.sold_value ?? 0), 0);
    const avgMargin = projects.length > 0
      ? projects.reduce((s, p) => s + (p.gross_margin_percent ?? 0), 0) / projects.length
      : 0;
    const ticketMedio = projects.length > 0
      ? projects.reduce((s, p) => s + (p.sold_value ?? 0), 0) / projects.length
      : 0;

    return {
      receitaMes,
      avgMargin,
      ticketMedio,
      totalProjetos: thisYearProjects.length,
    };
  }, [projects]);

  // Saldo em Conta: sum "saldo" from accounts
  const saldoEmConta = useMemo(() => {
    const items = extractItems<{ saldo?: number }>(accounts.data?.payload);
    return items.reduce((s, a) => s + (a?.saldo ?? 0), 0);
  }, [accounts.data]);

  // Receita do Mês from receivables: sum "valor" where data_vencimento is current month AND status is RECEBIDO or LIQUIDADO
  const receitaMesContaAzul = useMemo(() => {
    const items = extractItems<{ valor?: number; data_vencimento?: string; status?: string }>(receivables.data?.payload);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return items
      .filter((r) => {
        if (!r?.data_vencimento) return false;
        const d = new Date(r.data_vencimento);
        if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return false;
        const st = r?.status?.toUpperCase?.();
        return st === "RECEBIDO" || st === "LIQUIDADO";
      })
      .reduce((s, r) => s + (r?.valor ?? 0), 0);
  }, [receivables.data]);

  // Fluxo de Caixa chart: last 6 months receivables vs payables by data_vencimento
  const fluxoChart = useMemo(() => {
    const recItems = extractItems<{ valor?: number; data_vencimento?: string }>(receivables.data?.payload);
    const payItems = extractItems<{ valor?: number; data_vencimento?: string }>(payables.data?.payload);
    const now = new Date();
    const months: { label: string; receitas: number; despesas: number }[] = [];

    const groupByMonth = (items: typeof recItems) => {
      const byMonth: Record<string, number> = {};
      items.forEach((t) => {
        if (!t?.data_vencimento) return;
        const d = new Date(t.data_vencimento);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        byMonth[key] = (byMonth[key] || 0) + Math.abs(t?.valor ?? 0);
      });
      return byMonth;
    };

    const recByMonth = groupByMonth(recItems);
    const payByMonth = groupByMonth(payItems);

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      months.push({
        label,
        receitas: recByMonth[key] || 0,
        despesas: payByMonth[key] || 0,
      });
    }
    return months;
  }, [receivables.data, payables.data]);

  // Top 5 categorias de gastos: group payables by categoria.nome
  const expenseCategories = useMemo(() => {
    const items = extractItems<{ valor?: number; categoria?: { nome?: string } }>(payables.data?.payload);
    const byCategory: Record<string, number> = {};
    items.forEach((item) => {
      const catName = item?.categoria?.nome || "Outros";
      byCategory[catName] = (byCategory[catName] || 0) + Math.abs(item?.valor ?? 0);
    });
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [payables.data]);

  const hasFluxoData = fluxoChart.some((m) => m.receitas > 0 || m.despesas > 0);

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Receita do Mês (CA)" value={formatCurrency(receitaMesContaAzul)} icon={DollarSign} delay={0} />
        <StatCard title="Margem Bruta Média" value={formatPercent(kpis?.avgMargin ?? 0)} icon={Percent} delay={0.1} />
        <StatCard title="Ticket Médio" value={formatCurrency(kpis?.ticketMedio ?? 0)} icon={Hash} delay={0.2} />
        <StatCard title="Projetos no Ano" value={String(kpis?.totalProjetos ?? 0)} icon={FolderKanban} delay={0.3} />
        <StatCard title="Saldo em Conta" value={formatCurrency(saldoEmConta)} icon={Wallet} delay={0.4} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Fluxo de Caixa - Últimos 6 Meses</h2>
          {hasFluxoData ? (
            <ChartContainer config={{
              receitas: { label: "Receitas", color: "hsl(var(--success))" },
              despesas: { label: "Despesas", color: "hsl(var(--destructive))" },
            }} className="h-[250px]">
              <LineChart data={fluxoChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="receitas" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: "hsl(var(--success))" }} />
                <Line type="monotone" dataKey="despesas" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ fill: "hsl(var(--destructive))" }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">Sincronize os dados do Conta Azul para ver o fluxo.</p>
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
