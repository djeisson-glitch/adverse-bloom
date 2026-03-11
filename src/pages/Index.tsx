import { DollarSign, FolderKanban, Wallet, ArrowDownLeft, CheckCircle } from "lucide-react";
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

interface CAItem {
  total?: number;
  pago?: number;
  status?: string;
  data_vencimento?: string;
  data_competencia?: string;
  categorias?: { nome?: string }[];
  cliente?: { nome?: string };
}

export default function Index() {
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { accounts, receivables, payables, categories } = useAllContaAzulCache();

  const currentYearMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // 1. Receita do Mês: sum total from receivables where data_competencia starts with current month
  const receitaMes = useMemo(() => {
    const items = extractItems<CAItem>(receivables.data?.payload);
    return items
      .filter((r) => r?.data_competencia?.startsWith(currentYearMonth))
      .reduce((s, r) => s + (r?.total ?? 0), 0);
  }, [receivables.data, currentYearMonth]);

  // 2. Recebido no Mês: sum pago where data_competencia current month AND ACQUITTED
  const recebidoMes = useMemo(() => {
    const items = extractItems<CAItem>(receivables.data?.payload);
    return items
      .filter((r) => r?.data_competencia?.startsWith(currentYearMonth) && r?.status === "ACQUITTED")
      .reduce((s, r) => s + (r?.pago ?? 0), 0);
  }, [receivables.data, currentYearMonth]);

  // 3. A Receber: sum total where PENDING (all months)
  const aReceber = useMemo(() => {
    const items = extractItems<CAItem>(receivables.data?.payload);
    return items
      .filter((r) => r?.status === "PENDING")
      .reduce((s, r) => s + (r?.total ?? 0), 0);
  }, [receivables.data]);

  // 4. Despesas do Mês: sum total from payables where data_competencia current month
  const despesasMes = useMemo(() => {
    const items = extractItems<CAItem>(payables.data?.payload);
    return items
      .filter((r) => r?.data_competencia?.startsWith(currentYearMonth))
      .reduce((s, r) => s + (r?.total ?? 0), 0);
  }, [payables.data, currentYearMonth]);

  // 5. Saldo em Conta: sum saldo from all accounts
  const saldoEmConta = useMemo(() => {
    const accs = extractItems<{ saldo?: number }>(accounts.data?.payload);
    return accs.reduce((s, a) => s + (a?.saldo ?? 0), 0);
  }, [accounts.data]);

  // Projects KPI
  const totalProjetosAno = useMemo(() => {
    if (!projects) return 0;
    const cy = new Date().getFullYear();
    return projects.filter((p) => p.sold_date && new Date(p.sold_date).getFullYear() === cy).length;
  }, [projects]);

  // Fluxo chart: last 6 months with Caixa (data_vencimento, pago, ACQUITTED) and Competência (data_competencia, total, all)
  const fluxoChart = useMemo(() => {
    const recItems = extractItems<CAItem>(receivables.data?.payload);
    const payItems = extractItems<CAItem>(payables.data?.payload);
    const now = new Date();

    const groupCaixa = (items: CAItem[]) => {
      const byMonth: Record<string, number> = {};
      items.forEach((t) => {
        if (!t?.data_vencimento || t?.status !== "ACQUITTED") return;
        const key = t.data_vencimento.slice(0, 7);
        byMonth[key] = (byMonth[key] || 0) + (t?.pago ?? 0);
      });
      return byMonth;
    };

    const groupCompetencia = (items: CAItem[]) => {
      const byMonth: Record<string, number> = {};
      items.forEach((t) => {
        if (!t?.data_competencia) return;
        const key = t.data_competencia.slice(0, 7);
        byMonth[key] = (byMonth[key] || 0) + (t?.total ?? 0);
      });
      return byMonth;
    };

    const recCaixa = groupCaixa(recItems);
    const payCaixa = groupCaixa(payItems);
    const recComp = groupCompetencia(recItems);
    const payComp = groupCompetencia(payItems);

    const months: { label: string; caixaRec: number; caixaDes: number; compRec: number; compDes: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      months.push({
        label,
        caixaRec: recCaixa[key] || 0,
        caixaDes: payCaixa[key] || 0,
        compRec: recComp[key] || 0,
        compDes: payComp[key] || 0,
      });
    }
    return months;
  }, [receivables.data, payables.data]);

  // Top 5 categorias
  const expenseCategories = useMemo(() => {
    const items = extractItems<CAItem>(payables.data?.payload);
    const byCategory: Record<string, number> = {};
    items.forEach((item) => {
      const catName = item?.categorias?.[0]?.nome || "Outros";
      byCategory[catName] = (byCategory[catName] || 0) + Math.abs(item?.total ?? 0);
    });
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [payables.data]);

  const hasFluxoData = fluxoChart.some((m) => m.caixaRec > 0 || m.caixaDes > 0 || m.compRec > 0 || m.compDes > 0);

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Receita do Mês" value={formatCurrency(receitaMes)} icon={DollarSign} delay={0} />
        <StatCard title="Recebido no Mês" value={formatCurrency(recebidoMes)} icon={CheckCircle} delay={0.05} />
        <StatCard title="A Receber" value={formatCurrency(aReceber)} icon={ArrowDownLeft} delay={0.1} />
        <StatCard title="Despesas do Mês" value={formatCurrency(despesasMes)} icon={Wallet} delay={0.15} />
        <StatCard title="Projetos no Ano" value={String(totalProjetosAno)} icon={FolderKanban} delay={0.2} />
        <StatCard title="Saldo em Conta" value={formatCurrency(saldoEmConta)} icon={Wallet} delay={0.25} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Fluxo de Caixa - Últimos 6 Meses</h2>
          {hasFluxoData ? (
            <ChartContainer config={{
              caixaRec: { label: "Caixa - Receitas", color: "hsl(var(--success))" },
              caixaDes: { label: "Caixa - Despesas", color: "hsl(var(--destructive))" },
              compRec: { label: "Competência - Receitas", color: "hsl(142 71% 65%)" },
              compDes: { label: "Competência - Despesas", color: "hsl(0 72% 65%)" },
            }} className="h-[280px]">
              <LineChart data={fluxoChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line type="monotone" dataKey="caixaRec" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: "hsl(var(--success))" }} />
                <Line type="monotone" dataKey="caixaDes" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ fill: "hsl(var(--destructive))" }} />
                <Line type="monotone" dataKey="compRec" stroke="hsl(142 71% 65%)" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: "hsl(142 71% 65%)" }} />
                <Line type="monotone" dataKey="compDes" stroke="hsl(0 72% 65%)" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: "hsl(0 72% 65%)" }} />
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