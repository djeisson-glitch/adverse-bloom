import { useMemo } from "react";
import { motion } from "framer-motion";
import { useContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency } from "@/lib/format";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Loader2, Wallet, CreditCard } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { PeriodFilter } from "@/components/PeriodFilter";
import { usePeriod } from "@/contexts/PeriodContext";

interface PayItem {
  id?: string;
  total?: number;
  pago?: number;
  status?: string;
  status_traduzido?: string;
  descricao?: string;
  data_vencimento?: string;
  categorias?: { nome?: string }[];
  fornecedor?: { nome?: string };
}

function isInRange(dateStr: string | undefined, range: PeriodRange): boolean {
  if (!dateStr) return false;
  return dateStr >= range.from && dateStr <= range.to;
}

export default function Custos() {
  const { data: payablesCache, isLoading } = useContaAzulCache("payables");

  const [period, setPeriod] = useState<PeriodRange>(() => {
    const now = new Date();
    const pm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastDay = new Date(py, pm + 1, 0).getDate();
    return { from: `${py}-${String(pm + 1).padStart(2, "0")}-01`, to: `${py}-${String(pm + 1).padStart(2, "0")}-${lastDay}` };
  });

  const allItems = useMemo(() => extractItems<PayItem>(payablesCache?.payload), [payablesCache]);

  const filtered = useMemo(() => allItems.filter(i => isInRange(i?.data_vencimento, period)), [allItems, period]);

  const totalDespesas = useMemo(() => filtered.reduce((s, i) => s + (i?.total ?? 0), 0), [filtered]);
  const totalPago = useMemo(() => filtered.reduce((s, i) => s + (i?.pago ?? 0), 0), [filtered]);

  const categoryChart = useMemo(() => {
    const byCategory: Record<string, number> = {};
    filtered.forEach(item => {
      const catName = item?.categorias?.[0]?.nome || "Outros";
      byCategory[catName] = (byCategory[catName] || 0) + Math.abs(item?.total ?? 0);
    });
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const hasData = allItems.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Custos</h1>
          <p className="text-sm text-muted-foreground">Análise detalhada de despesas</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Sincronize os dados para visualizar os custos.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Despesas do Período" value={formatCurrency(totalDespesas)} icon={Wallet} delay={0} />
            <StatCard title="Pago no Período" value={formatCurrency(totalPago)} icon={CreditCard} delay={0.05} />
            <StatCard title="Itens no Período" value={String(filtered.length)} icon={Wallet} delay={0.1} />
          </div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6">
            <h2 className="font-heading text-lg font-semibold mb-4">Top 10 Categorias de Despesas</h2>
            {categoryChart.length > 0 ? (
              <ChartContainer config={{ value: { label: "Valor", color: "hsl(var(--destructive))" } }} className="h-[320px]">
                <BarChart data={categoryChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={160} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma despesa no período selecionado.</p>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card overflow-hidden">
            <h2 className="font-heading text-lg font-semibold p-6 pb-2">Detalhamento de Despesas</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-4 font-medium">Vencimento</th>
                    <th className="p-4 font-medium">Descrição</th>
                    <th className="p-4 font-medium">Categoria</th>
                    <th className="p-4 font-medium text-right">Total</th>
                    <th className="p-4 font-medium text-right">Pago</th>
                    <th className="p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="p-4 whitespace-nowrap">{item.data_vencimento ?? "—"}</td>
                      <td className="p-4 max-w-[300px] truncate">{item.descricao ?? "—"}</td>
                      <td className="p-4 whitespace-nowrap">{item.categorias?.[0]?.nome ?? "—"}</td>
                      <td className="p-4 text-right font-heading whitespace-nowrap">{formatCurrency(item.total ?? 0)}</td>
                      <td className="p-4 text-right font-heading whitespace-nowrap">{formatCurrency(item.pago ?? 0)}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === "ACQUITTED" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                        }`}>
                          {item.status_traduzido ?? item.status ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <p className="p-4 text-xs text-muted-foreground text-center">Mostrando 100 de {filtered.length} itens</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
