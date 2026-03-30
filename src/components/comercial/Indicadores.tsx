import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Trophy, Target, DollarSign, Clock, BarChart3, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, PieChart, Pie, Cell } from "recharts";
import type { Deal } from "@/hooks/useDeals";
import type { Task } from "@/hooks/useTasks";
import { addDays, isAfter, isBefore } from "date-fns";

interface Props {
  deals: Deal[];
  meta?: number;
  allTasks?: Task[];
  periodFrom?: string;
  periodTo?: string;
}

const PIE_COLORS = ["hsl(var(--primary))", "#f59e0b", "#8b5cf6", "#22c55e", "#ec4899", "#6b7280"];

export function Indicadores({ deals, meta = 200000, allTasks = [], periodFrom, periodTo }: Props) {
  const stats = useMemo(() => {
    const openStages = ["contato", "proposta", "negociacao"];
    const openDeals = deals.filter((d) => openStages.includes(d.stage));
    const totalPipeline = openDeals.reduce((s, d) => s + (d.approved_value ?? d.value ?? 0), 0);

    const wonDeals = deals.filter((d) => d.stage === "fechamento");
    const wonValue = wonDeals.reduce((s, d) => s + (d.approved_value ?? d.value ?? 0), 0);
    const wonCount = wonDeals.length;

    const totalCreated = deals.length;
    const conversionRate = totalCreated > 0 ? (wonCount / totalCreated) * 100 : 0;
    const avgTicket = wonCount > 0 ? wonValue / wonCount : 0;

    const cycles = wonDeals
      .filter((d) => d.created_at && d.updated_at)
      .map((d) => {
        const start = new Date(d.created_at!).getTime();
        const end = new Date(d.updated_at!).getTime();
        return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
      });
    const avgCycle = cycles.length > 0 ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;

    // Chart: last 6 months
    const now = new Date();
    const months: { month: string; ganhos: number; meta: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const monthWon = wonDeals
        .filter((deal) => {
          const upd = deal.updated_at ? new Date(deal.updated_at) : null;
          return upd && upd.getFullYear() === d.getFullYear() && upd.getMonth() === d.getMonth();
        })
        .reduce((s, deal) => s + (deal.approved_value ?? deal.value ?? 0), 0);
      months.push({ month: label, ganhos: monthWon, meta });
    }

    // Loss reasons
    const lostDeals = deals.filter((d) => d.stage === "perdido");
    const reasonMap: Record<string, number> = {};
    lostDeals.forEach((d) => {
      const r = (d as any).lost_reason || "Não informado";
      reasonMap[r] = (reasonMap[r] || 0) + 1;
    });
    const lossReasons = Object.entries(reasonMap).map(([name, value]) => ({ name, value }));

    return { totalPipeline, wonValue, wonCount, conversionRate, avgTicket, avgCycle, months, meta, lossReasons };
  }, [deals, meta]);

  // Upcoming / overdue tasks
  const urgentTasks = useMemo(() => {
    const now = new Date();
    const in7 = addDays(now, 7);
    return allTasks
      .filter((t) => !t.completed && t.due_date)
      .filter((t) => isBefore(new Date(t.due_date!), in7))
      .slice(0, 10);
  }, [allTasks]);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
           <Card className="bg-card border-border overflow-hidden min-w-0">
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

        {stats.lossReasons.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card className="bg-card border-border overflow-hidden min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Motivos de perda</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={stats.lossReasons} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                      {stats.lossReasons.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {urgentTasks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Tarefas vencidas ou vencendo em 7 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {urgentTasks.map((task) => {
                  const overdue = isBefore(new Date(task.due_date!), new Date());
                  return (
                    <div key={task.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/30">
                      <span className="text-sm truncate flex-1">{task.title}</span>
                      <span className={`text-xs shrink-0 ml-2 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {formatDate(task.due_date!)}
                        {overdue && " (vencida)"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
