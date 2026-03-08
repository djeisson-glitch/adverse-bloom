import { useMemo } from "react";
import { motion } from "framer-motion";
import { useContaAzulCache } from "@/hooks/useContaAzulCache";
import { formatCurrency } from "@/lib/format";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Loader2 } from "lucide-react";

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(210, 70%, 65%)",
  "hsl(280, 60%, 55%)",
];

export default function Custos() {
  const { data: payablesCache, isLoading } = useContaAzulCache("payables");

  const { fixedVsVariable, topCategories, monthVariation } = useMemo(() => {
    const empty = { fixedVsVariable: [] as { name: string; value: number }[], topCategories: [] as { name: string; value: number }[], monthVariation: [] as { mes: string; total: number; variacao: string }[] };
    if (!payablesCache?.payload) return empty;
    try {
      const items = payablesCache.payload as unknown as Array<{
        category?: string;
        cost_type?: string;
        amount?: number;
        due_date?: string;
      }>;
      if (!Array.isArray(items)) return empty;

      // Fixed vs Variable
      let fixed = 0, variable = 0;
      const categories: Record<string, number> = {};
      const byMonth: Record<string, number> = {};

      items.forEach((t) => {
        const amount = Math.abs(t.amount || 0);
        if (t.cost_type === "FIXED") fixed += amount;
        else variable += amount;

        const cat = t.category || "Outros";
        categories[cat] = (categories[cat] || 0) + amount;

        if (t.due_date) {
          const d = new Date(t.due_date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          byMonth[key] = (byMonth[key] || 0) + amount;
        }
      });

      const fixedVsVariable = [
        { name: "Fixos", value: fixed },
        { name: "Variáveis", value: variable },
      ].filter((d) => d.value > 0);

      const topCategories = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name, value }));

      const sortedMonths = Object.keys(byMonth).sort();
      const monthVariation = sortedMonths.map((key, i) => {
        const [y, m] = key.split("-");
        const d = new Date(parseInt(y), parseInt(m) - 1);
        const mes = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
        const total = byMonth[key];
        const prev = i > 0 ? byMonth[sortedMonths[i - 1]] : total;
        const pct = prev > 0 ? ((total - prev) / prev) * 100 : 0;
        return { mes, total, variacao: i === 0 ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` };
      });

      return { fixedVsVariable, topCategories, monthVariation };
    } catch {
      return empty;
    }
  }, [payablesCache]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const hasData = topCategories.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Custos</h1>
        <p className="text-sm text-muted-foreground">Análise detalhada de despesas</p>
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Sincronize os dados do Conta Azul para visualizar os custos.</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4">Custos Fixos vs Variáveis</h2>
              <ChartContainer config={{
                Fixos: { label: "Fixos", color: PIE_COLORS[0] },
                Variáveis: { label: "Variáveis", color: PIE_COLORS[1] },
              }} className="h-[280px]">
                <PieChart>
                  <Pie data={fixedVsVariable} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {fixedVsVariable.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4">Top 10 Categorias de Despesas</h2>
              <ChartContainer config={{ value: { label: "Valor", color: "hsl(var(--primary))" } }} className="h-[280px]">
                <BarChart data={topCategories} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={130} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card overflow-hidden">
            <h2 className="font-heading text-lg font-semibold p-6 pb-2">Variação Mensal de Custos</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-4 font-medium">Mês</th>
                    <th className="p-4 font-medium text-right">Total</th>
                    <th className="p-4 font-medium text-right">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {monthVariation.map((m) => (
                    <tr key={m.mes} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="p-4 font-medium capitalize">{m.mes}</td>
                      <td className="p-4 text-right font-heading">{formatCurrency(m.total)}</td>
                      <td className={`p-4 text-right font-medium ${m.variacao.startsWith("+") ? "text-destructive" : m.variacao.startsWith("-") ? "text-success" : "text-muted-foreground"}`}>
                        {m.variacao}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
