import { useMemo, useState } from "react";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine, Cell, LabelList } from "recharts";
import { Badge } from "@/components/ui/badge";
import { type CAItem } from "@/lib/financial";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function Projecoes2026() {
  const { receivables } = useAllContaAzulCache();
  const [metaAnual, setMetaAnual] = useState(1500000);

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);

  // Always use data_competencia + item.total (faturamento, not recebimento)
  const getMonthlyByYear = (year: number) => {
    const months: number[] = Array(12).fill(0);
    recItems.forEach(item => {
      const dc = item?.data_competencia;
      if (!dc?.startsWith(String(year))) return;
      const m = Number(dc.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) {
        months[m] += item?.total ?? 0;
      }
    });
    return months;
  };

  const data2024 = useMemo(() => getMonthlyByYear(2024), [recItems]);
  const data2025 = useMemo(() => getMonthlyByYear(2025), [recItems]);
  const data2026 = useMemo(() => getMonthlyByYear(2026), [recItems]);

  // Seasonality from 2024 + 2025
  const seasonality = useMemo(() => {
    const combined = data2024.map((v, i) => v + data2025[i]);
    const total = combined.reduce((s, v) => s + v, 0);
    return combined.map(v => total > 0 ? (v / total) * 100 : 100 / 12);
  }, [data2024, data2025]);

  const avgSeason = 100 / 12;
  const classify = (pct: number) => {
    if (pct > avgSeason * 1.3) return "Pico";
    if (pct < avgSeason * 0.7) return "Baixa";
    return "Normal";
  };

  const proj2026Base = seasonality.map(pct => (metaAnual * pct) / 100);
  const proj2026Conservador = proj2026Base.map(v => v * 0.9);
  const proj2026Agressivo = proj2026Base.map(v => v * 1.1);

  // Dynamic: months before current month = real, from current month onward = projection
  const currentMonth = new Date().getMonth(); // 0-indexed (Mar = 2)

  const chartData = useMemo(() =>
    MONTH_LABELS.map((label, i) => {
      const isReal = i < currentMonth && data2026[i] > 0;
      const isTransition = i === currentMonth - 1; // last real month bridges to projection
      return {
        label,
        real2024: data2024[i],
        real2025: data2025[i],
        // Solid line: real data for closed months
        solid2026: isReal ? data2026[i] : (isTransition ? data2026[i] : null),
        // Dashed line: projection from current month onward, overlapping last real point for continuity
        dash2026: i >= currentMonth ? proj2026Base[i] : (isTransition && data2026[i] > 0 ? data2026[i] : null),
        meta2026: proj2026Base[i],
      };
    }),
    [data2024, data2025, data2026, proj2026Base, currentMonth]);

  const getSeasonColor = (pct: number) => {
    if (pct >= 13) return "#FF0000";
    if (pct >= 9) return "#f59e0b";
    if (pct >= 6) return "#10b981";
    return "#ef4444";
  };

  const seasonChartData = useMemo(() =>
    MONTH_LABELS.map((label, i) => ({
      label,
      value: seasonality[i],
      label_pct: `${seasonality[i].toFixed(1)}%`,
      fill: getSeasonColor(seasonality[i]),
    })),
    [seasonality]);

  const tableData = MONTH_LABELS.map((label, i) => ({
    month: label,
    seasonPct: seasonality[i],
    classification: classify(seasonality[i]),
    meta2026: proj2026Base[i],
    conservador: proj2026Conservador[i],
    agressivo: proj2026Agressivo[i],
    real2024: data2024[i],
    real2025: data2025[i],
    real2026: data2026[i],
    gap2026: data2026[i] > 0 ? data2026[i] - proj2026Base[i] : 0,
  }));

  const total2024 = data2024.reduce((s, v) => s + v, 0);
  const total2025 = data2025.reduce((s, v) => s + v, 0);
  const total2026 = data2026.reduce((s, v) => s + v, 0);
  const hasData = recItems.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Projeções 2026</h1>
        <p className="text-sm text-muted-foreground">Cenários e sazonalidade baseados em dados históricos</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="w-[200px]">
            <Label className="text-xs text-muted-foreground">Meta Anual 2026 (R$)</Label>
            <Input type="number" value={metaAnual} onChange={e => setMetaAnual(Number(e.target.value))} className="h-8 mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Receita Emitida</Label>
            <Switch checked={useRecebida} onCheckedChange={setUseRecebida} />
            <Label className="text-xs text-muted-foreground">Receita Recebida</Label>
          </div>
        </div>
      </motion.div>

      {!hasData ? (
        <div className="glass-card p-10 text-center text-muted-foreground">Sincronize os dados para ver as projeções.</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Conservador (-10%)", value: metaAnual * 0.9, color: "text-warning" },
              { label: "Base", value: metaAnual, color: "text-primary" },
              { label: "Agressivo (+10%)", value: metaAnual * 1.1, color: "text-success" },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className={`font-heading text-2xl font-bold mt-1 ${s.color}`}>{formatCurrency(s.value)}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <p className="text-sm text-muted-foreground">Total 2024 <span className="opacity-60">(ano completo)</span></p>
              <p className="font-heading text-xl font-bold mt-1">{formatCurrency(total2024)}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-sm text-muted-foreground">Total 2025 <span className="opacity-60">(ano completo)</span></p>
              <p className="font-heading text-xl font-bold mt-1">{formatCurrency(total2025)}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-sm text-muted-foreground">Total 2026 <span className="opacity-60">(até agora)</span></p>
              <p className="font-heading text-xl font-bold mt-1">{formatCurrency(total2026)}</p>
            </div>
          </div>

           <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
            <h2 className="font-heading text-lg font-semibold mb-4">Comparativo Anual</h2>
            <ChartContainer config={{
              real2024: { label: "2024 Real", color: "hsl(var(--muted-foreground))" },
              real2025: { label: "2025 Real", color: "hsl(var(--success))" },
              solid2026: { label: "2026 Real", color: "#3b82f6" },
              dash2026: { label: "2026 Projeção", color: "#3b82f6" },
              meta2026: { label: "2026 Meta", color: "#fbbf24" },
            }} className="h-[500px] max-sm:h-[350px]">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line type="monotone" dataKey="real2024" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="real2025" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: "hsl(var(--success))", r: 3 }} />
                <Line type="monotone" dataKey="solid2026" stroke="#3b82f6" strokeWidth={3} dot={{ fill: "#3b82f6", r: 4, strokeWidth: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey="dash2026" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 4" dot={{ fill: "#3b82f6", r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="meta2026" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ChartContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
            <h2 className="font-heading text-lg font-semibold mb-4">Detalhamento Mensal</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Mês</th>
                    <th className="pb-3 font-medium text-center">Sazonalidade</th>
                    <th className="pb-3 font-medium text-right">Real 2024</th>
                    <th className="pb-3 font-medium text-right">Real 2025</th>
                    <th className="pb-3 font-medium text-right">Real 2026</th>
                    <th className="pb-3 font-medium text-right">Meta 2026</th>
                    <th className="pb-3 font-medium text-right">Conservador</th>
                    <th className="pb-3 font-medium text-right">Agressivo</th>
                    <th className="pb-3 font-medium text-right">Gap 2026</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 font-medium">{row.month}</td>
                      <td className="py-2 text-center">
                        <Badge variant={row.classification === "Pico" ? "default" : row.classification === "Baixa" ? "destructive" : "secondary"} className="text-xs">
                          {formatPercent(row.seasonPct)} · {row.classification}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">{formatCurrency(row.real2024)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.real2025)}</td>
                      <td className="py-2 text-right">{row.real2026 > 0 ? formatCurrency(row.real2026) : "—"}</td>
                      <td className="py-2 text-right">{formatCurrency(row.meta2026)}</td>
                      <td className="py-2 text-right text-warning">{formatCurrency(row.conservador)}</td>
                      <td className="py-2 text-right text-success">{formatCurrency(row.agressivo)}</td>
                      <td className={`py-2 text-right ${row.gap2026 >= 0 ? "text-success" : "text-destructive"}`}>
                        {row.real2026 > 0 ? formatCurrency(row.gap2026) : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-center">100%</td>
                    <td className="py-2 text-right">{formatCurrency(total2024)}</td>
                    <td className="py-2 text-right">{formatCurrency(total2025)}</td>
                    <td className="py-2 text-right">{formatCurrency(total2026)}</td>
                    <td className="py-2 text-right">{formatCurrency(metaAnual)}</td>
                    <td className="py-2 text-right text-warning">{formatCurrency(metaAnual * 0.9)}</td>
                    <td className="py-2 text-right text-success">{formatCurrency(metaAnual * 1.1)}</td>
                    <td className="py-2 text-right">{formatCurrency(total2026 - metaAnual)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
            <h2 className="font-heading text-lg font-semibold mb-4">Visualização de Sazonalidade</h2>
            <ChartContainer config={{
              seasonality: { label: "Sazonalidade", color: "hsl(var(--primary))" },
            }} className="h-[400px] sm:h-[400px] max-sm:h-[300px]">
              <BarChart data={seasonChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${v.toFixed(0)}%`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine y={avgSeason} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `Média ${avgSeason.toFixed(1)}%`, position: "insideTopRight", fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Sazonalidade">
                  <LabelList dataKey="label_pct" position="top" fill="hsl(var(--foreground))" fontSize={10} />
                  {seasonChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </motion.div>
        </>
      )}
    </div>
  );
}
