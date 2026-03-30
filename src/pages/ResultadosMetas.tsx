import { useMemo, useEffect, useCallback, useState } from "react";
import { DollarSign, TrendingUp, Target, BarChart3, Percent, Calculator, Hash } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency, formatPercent } from "@/lib/format";
import { PeriodFilter } from "@/components/PeriodFilter";
import { usePeriod } from "@/contexts/PeriodContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar, ReferenceLine } from "recharts";
import {
  type CAItem, isInRange,
  calcReceitaTotal, calcDespesasOperacionais, calcCustosFixos, calcCustosVariaveis,
  calcMargemContribuicao, calcLucroLiquido, calcPontoEquilibrio, calcTicketMedio,
  monthKey, monthlyReceitaTotal, monthlyDespesasOp,
} from "@/lib/financial";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRef } from "react";

export default function ResultadosMetas() {
  const { receivables, payables } = useAllContaAzulCache();
  const { period, setPeriod } = usePeriod();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load targets from DB
  const { data: targetRow, isLoading: loadingTargets } = useQuery({
    queryKey: ["budget-targets", currentYear],
    queryFn: async () => {
      const { data } = await supabase.from("budget_targets").select("*")
        .eq("year", currentYear).maybeSingle();
      return data;
    },
  });

  const metaAnual = targetRow?.annual_target ?? 1500000;
  const metaTicketLocal = useRef(50000);
  const metaMargemLocal = useRef(20);

  // We use local state that syncs from DB
  const [metaAnualInput, setMetaAnualInput] = useState(metaAnual);
  const [metaTicket, setMetaTicket] = useState(50000);
  const [metaMargem, setMetaMargem] = useState(20);

  // Need to import useState
  useEffect(() => {
    if (targetRow) {
      setMetaAnualInput(targetRow.annual_target ?? 1500000);
    }
  }, [targetRow]);

  const saveMutation = useMutation({
    mutationFn: async (values: { annual_target?: number }) => {
      const payload = {
        year: currentYear,
        annual_target: values.annual_target ?? metaAnualInput,
        q1_percent: targetRow?.q1_percent ?? 25,
        q2_percent: targetRow?.q2_percent ?? 25,
        q3_percent: targetRow?.q3_percent ?? 25,
        q4_percent: targetRow?.q4_percent ?? 25,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("budget_targets")
        .upsert(payload, { onConflict: "year" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-targets"] });
      toast.success("Meta salva!");
    },
  });

  const debouncedSave = useCallback((annual: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveMutation.mutate({ annual_target: annual });
    }, 800);
  }, [saveMutation]);

  const handleMetaAnualChange = (v: number) => {
    setMetaAnualInput(v);
    debouncedSave(v);
  };

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const receitaTotal = useMemo(() => calcReceitaTotal(recItems, period), [recItems, period]);
  const despesasOp = useMemo(() => calcDespesasOperacionais(payItems, period), [payItems, period]);
  const custosFixos = useMemo(() => calcCustosFixos(payItems, period), [payItems, period]);
  const custosVariaveis = useMemo(() => calcCustosVariaveis(payItems, period), [payItems, period]);

  const { valor: margemContribValor, pct: margemContribuicao } = calcMargemContribuicao(receitaTotal, custosVariaveis);
  const { valor: lucroLiquido, pct: margemLiquida } = calcLucroLiquido(receitaTotal, despesasOp);
  const pontoEquilibrio = calcPontoEquilibrio(custosFixos, margemContribuicao);
  const { valor: ticketMedio, qtde: qtdeProjetos } = calcTicketMedio(recItems, period, receitaTotal);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { label: string; key: string; receita: number; despesas: number; margem: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = monthKey(d.getFullYear(), d.getMonth());
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
      const rec = monthlyReceitaTotal(recItems, k);
      const desp = monthlyDespesasOp(payItems, k);
      const margem = rec > 0 ? ((rec - desp) / rec) * 100 : 0;
      months.push({ label, key: k, receita: rec, despesas: desp, margem });
    }
    return months;
  }, [recItems, payItems]);

  const fatVsMetaData = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const metaMensal = metaAnualInput / 12;
    const months: { label: string; faturamento: number; meta: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const k = monthKey(y, m);
      const label = new Date(y, m, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const fat = monthlyReceitaTotal(recItems, k);
      months.push({ label, faturamento: fat, meta: metaMensal });
    }
    return months;
  }, [recItems, metaAnualInput]);

  const topClients = useMemo(() => {
    const recFiltered = recItems.filter(r => isInRange(r?.data_competencia, period));
    const byClient: Record<string, { revenue: number; count: number }> = {};
    recFiltered.forEach(item => {
      const name = item?.cliente?.nome || "Sem cliente";
      if (!byClient[name]) byClient[name] = { revenue: 0, count: 0 };
      byClient[name].revenue += item?.total ?? 0;
      byClient[name].count += 1;
    });
    return Object.entries(byClient)
      .map(([name, d]) => ({ name, revenue: d.revenue, projects: d.count, ticket: d.count > 0 ? d.revenue / d.count : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
  }, [recItems, period]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Resultados & Metas</h1>
          <p className="text-sm text-muted-foreground">Análise de performance e metas financeiras</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
        <h3 className="font-heading text-sm font-semibold mb-3 text-muted-foreground">Metas Configuráveis</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Meta Anual (R$)</Label>
            <Input type="number" value={metaAnualInput} onChange={e => handleMetaAnualChange(Number(e.target.value))} className="h-8 mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Meta Ticket Médio (R$)</Label>
            <Input type="number" value={metaTicket} onChange={e => setMetaTicket(Number(e.target.value))} className="h-8 mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Meta Margem Líquida (%)</Label>
            <Input type="number" value={metaMargem} onChange={e => setMetaMargem(Number(e.target.value))} className="h-8 mt-1" />
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Receita Total" value={formatCurrency(receitaTotal)} icon={DollarSign} delay={0} />
        <StatCard title="Despesas Operacionais" value={formatCurrency(despesasOp)} icon={TrendingUp} delay={0.05} />
        <StatCard title="Lucro Líquido" value={formatCurrency(lucroLiquido)} icon={Target} change={lucroLiquido >= 0 ? "Positivo" : "Negativo"} changeType={lucroLiquido >= 0 ? "positive" : "negative"} delay={0.1} />
        <StatCard title="Margem Líquida" value={formatPercent(margemLiquida)} icon={Percent} change={`Meta: ${metaMargem}%`} changeType={margemLiquida >= metaMargem ? "positive" : "negative"} delay={0.15} />
        <StatCard title="Ticket Médio" value={formatCurrency(ticketMedio)} icon={BarChart3} change={`Meta: ${formatCurrency(metaTicket)}`} changeType={ticketMedio >= metaTicket ? "positive" : "negative"} delay={0.2} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Custos Fixos" value={formatCurrency(custosFixos)} icon={Calculator} delay={0.25} />
        <StatCard title="Custos Variáveis" value={formatCurrency(custosVariaveis)} icon={Calculator} delay={0.3} />
        <StatCard title="Margem Contribuição" value={formatPercent(margemContribuicao)} icon={Percent} delay={0.35} />
        <StatCard title="Qtde Projetos" value={String(qtdeProjetos)} icon={Hash} delay={0.4} />
        <StatCard title="Ponto de Equilíbrio" value={formatCurrency(pontoEquilibrio)} icon={Target} delay={0.45} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6 overflow-hidden">
          <h2 className="font-heading text-lg font-semibold mb-4">Receita vs Despesas - 12 Meses</h2>
          <ChartContainer config={{
            receita: { label: "Receita", color: "hsl(var(--success))" },
            despesas: { label: "Despesas", color: "hsl(var(--destructive))" },
          }} className="h-[280px] w-full">
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Line type="monotone" dataKey="receita" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: "hsl(var(--success))" }} />
              <Line type="monotone" dataKey="despesas" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ fill: "hsl(var(--destructive))" }} />
            </LineChart>
          </ChartContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6 overflow-hidden">
          <h2 className="font-heading text-lg font-semibold mb-4">Faturamento vs Meta Mensal</h2>
          <ChartContainer config={{
            faturamento: { label: "Faturamento", color: "hsl(var(--primary))" },
            meta: { label: "Meta", color: "hsl(var(--warning))" },
          }} className="h-[280px]">
            <BarChart data={fatVsMetaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="faturamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <ReferenceLine y={metaAnualInput / 12} stroke="hsl(var(--warning))" strokeDasharray="5 5" label={{ value: "Meta", fill: "hsl(var(--warning))", fontSize: 11 }} />
            </BarChart>
          </ChartContainer>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Margem Líquida % - Evolução Mensal</h2>
        <ChartContainer config={{ margem: { label: "Margem %", color: "hsl(var(--primary))" } }} className="h-[250px]">
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${v.toFixed(0)}%`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ReferenceLine y={metaMargem} stroke="hsl(var(--warning))" strokeDasharray="5 5" label={{ value: `Meta ${metaMargem}%`, fill: "hsl(var(--warning))", fontSize: 11 }} />
            <Line type="monotone" dataKey="margem" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
          </LineChart>
        </ChartContainer>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="glass-card p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Top Clientes por Receita</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 font-medium">Cliente</th>
                <th className="pb-3 font-medium text-right">Receita</th>
                <th className="pb-3 font-medium text-right">Projetos</th>
                <th className="pb-3 font-medium text-right">Ticket Médio</th>
                <th className="pb-3 font-medium text-right">% do Total</th>
              </tr>
            </thead>
            <tbody>
              {topClients.map((c, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3 text-right">{formatCurrency(c.revenue)}</td>
                  <td className="py-3 text-right">{c.projects}</td>
                  <td className="py-3 text-right">{formatCurrency(c.ticket)}</td>
                  <td className="py-3 text-right">{receitaTotal > 0 ? formatPercent((c.revenue / receitaTotal) * 100) : "0%"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {topClients.length === 0 && <p className="text-center text-muted-foreground py-8">Sem dados no período selecionado.</p>}
        </div>
      </motion.div>
    </div>
  );
}
