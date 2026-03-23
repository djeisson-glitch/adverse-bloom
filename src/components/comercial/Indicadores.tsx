import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Trophy, Target, DollarSign, Clock, BarChart3 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, ReferenceLine } from "recharts";
import type { Deal } from "@/hooks/useDeals";

interface Props {
  deals: Deal[];
  meta?: number;
}

export function Indicadores({ deals, meta = 200000 }: Props) {
  const stats = useMemo(() => {
    const now = new Date();
    const openStages = ["contato", "proposta", "negociacao"];
    const openDeals = deals.filter((d) => openStages.includes(d.stage));
    const totalPipeline = openDeals.reduce((s, d) => s + (d.value || 0), 0);

    const wonDeals = deals.filter((d) => d.stage === "ganho");
    const wonValue = wonDeals.reduce((s, d) => s + (d.value || 0), 0);
    const wonCount = wonDeals.length;

    const totalCreated = deals.length;
    const conversionRate = totalCreated > 0 ? (wonCount / totalCreated) * 100 : 0;
    const avgTicket = wonCount > 0 ? wonValue / wonCount : 0;

    // Average cycle
    const cycles = wonDeals
      .filter((d) => d.created_at && d.updated_at)
      .map((d) => {
        const start = new Date(d.created_at!).getTime();
        const end = new Date(d.updated_at!).getTime();
        return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
      });
    const avgCycle = cycles.length > 0 ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;

    // Chart: last 6 months
    const months: { month: string; ganhos: number; meta: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const monthWon = wonDeals
        .filter((deal) => {
          const upd = deal.updated_at ? new Date(deal.updated_at) : null;
          return upd && upd.getFullYear() === d.getFullYear() && upd.getMonth() === d.getMonth();
        })
        .reduce((s, deal) => s + (deal.value || 0), 0);
      months.push({ month: label, ganhos: monthWon, meta });
    }

    return { totalPipeline, wonValue, wonCount, conversionRate, avgTicket, avgCycle, months, meta };
  }, [deals, meta]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={DollarSign} title="Pipeline total" value={formatCurrency(stats.totalPipeline)} delay={0} />
        <StatCard icon={Trophy} title="Deals ganhos" value={`${stats.wonCount}`} change={formatCurrency(stats.wonValue)} changeType="positive" delay={0.05} />
        <StatCard icon={Target} title="Conversão" value={formatPercent(stats.conversionRate)} delay={0.1} />
        <StatCard icon={BarChart3} title="Ticket médio" value={formatCurrency(stats.avgTicket)} delay={0.15} />
        <StatCard icon={Clock} title="Ciclo médio" value={`${stats.avgCycle} dias`} delay={0.2} />
        <StatCard icon={TrendingUp} title="Meta mensal" value={formatCurrency(stats.meta)} change={formatCurrency(stats.wonValue)} changeType={stats.wonValue >= stats.meta ? "positive" : "negative"} delay={0.25} />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deals ganhos vs Meta mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stats.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name === "ganhos" ? "Ganhos" : "Meta"]}
                />
                <Bar dataKey="ganhos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="meta" stroke="hsl(var(--muted-foreground))" strokeDasharray="6 4" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
