import { useMemo, useState } from "react";
import { hojeISO, emDiasISO } from "@/lib/dataLocal";
import { Wallet, TrendingDown, Clock, CalendarDays, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import {
  type CAItem,
  calcSaldoEmConta, calcBurnRate,
} from "@/lib/financial";
import { useEmpresaContexto } from "@/hooks/useEmpresaContexto";
import { CashIndicators } from "@/components/caixa/CashIndicators";
import { AccountsDetail } from "@/components/caixa/AccountsDetail";
import { CashAlerts } from "@/components/caixa/CashAlerts";

export default function CaixaRunway() {
  const { receivables, payables } = useAllContaAzulCache();

  const [simProLabore, setSimProLabore] = useState(0);
  const [simContratacao, setSimContratacao] = useState(0);
  const [simInvestimento, setSimInvestimento] = useState(0);

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const { data: ctxSaldo } = useEmpresaContexto();
  const saldoAtual = useMemo(() => calcSaldoEmConta(recItems, payItems, ctxSaldo?.saldo_inicial, ctxSaldo?.saldo_inicial_data), [recItems, payItems, ctxSaldo?.saldo_inicial, ctxSaldo?.saldo_inicial_data]);
  const burnRate = useMemo(() => calcBurnRate(payItems), [payItems]);
  const runway = burnRate > 0 ? saldoAtual / burnRate : Infinity;

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const entradasMes = useMemo(() => recItems.filter(r => r?.data_vencimento?.startsWith(thisMonthKey)).reduce((s, r) => s + (r?.pago ?? 0), 0), [recItems, thisMonthKey]);
  const saidasMes = useMemo(() => payItems.filter(r => r?.data_vencimento?.startsWith(thisMonthKey)).reduce((s, r) => s + (r?.pago ?? 0), 0), [payItems, thisMonthKey]);

  const recPendingMonth = useMemo(() => recItems.filter(r => r?.data_vencimento?.startsWith(thisMonthKey) && r?.status === "PENDING").reduce((s, r) => s + (r?.total ?? 0), 0), [recItems, thisMonthKey]);
  const payPendingMonth = useMemo(() => payItems.filter(r => r?.data_vencimento?.startsWith(thisMonthKey) && r?.status === "PENDING").reduce((s, r) => s + (r?.total ?? 0), 0), [payItems, thisMonthKey]);
  const saldoProjetado = saldoAtual + recPendingMonth - payPendingMonth;

  const newBurnWithSim = burnRate + simProLabore + simContratacao;
  const saldoAfterInvestment = saldoAtual - simInvestimento;
  const runwaySim = newBurnWithSim > 0 ? saldoAfterInvestment / newBurnWithSim : Infinity;

  const cashFlowChart = useMemo(() => {
    const months: { label: string; realizado: number; projetado: number }[] = [];
    for (let i = 5; i >= -3; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
      const entradas = recItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.pago ?? 0), 0);
      const saidas = payItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.pago ?? 0), 0);
      const isFuture = i < 0;
      if (isFuture) {
        const projEntradas = recItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.total ?? 0), 0);
        const projSaidas = payItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.total ?? 0), 0);
        months.push({ label, realizado: 0, projetado: projEntradas - projSaidas });
      } else {
        months.push({ label, realizado: entradas - saidas, projetado: 0 });
      }
    }
    return months;
  }, [recItems, payItems]);

  const today = hojeISO();
  const in30 = emDiasISO(30);
  const upcomingRec = useMemo(() =>
    recItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in30)
      .sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || ""))
      .slice(0, 20),
    [recItems, today, in30]);

  const upcomingPay = useMemo(() =>
    payItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in30)
      .sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || ""))
      .slice(0, 20),
    [payItems, today, in30]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Caixa & Runway</h1>
        <p className="text-sm text-muted-foreground">Gestão de caixa, projeções e simulações</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Saldo Atual" value={formatCurrency(saldoAtual)} icon={Wallet} delay={0} />
        <StatCard title="Burn Rate Médio" value={formatCurrency(burnRate)} icon={TrendingDown} change="Últimos 3 meses" delay={0.05} />
        <StatCard title="Runway" value={runway === Infinity ? "∞" : `${runway.toFixed(1)} meses`} icon={Clock} change={runway < 3 ? "Atenção!" : "Saudável"} changeType={runway < 3 ? "negative" : "positive"} delay={0.1} />
        <StatCard title="Saldo Projetado (fim mês)" value={formatCurrency(saldoProjetado)} icon={CalendarDays} delay={0.15} />
        <StatCard title="Entradas do Mês" value={formatCurrency(entradasMes)} icon={ArrowDownLeft} delay={0.2} />
        <StatCard title="Saídas do Mês" value={formatCurrency(saidasMes)} icon={ArrowUpRight} delay={0.25} />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Simuladores de Impacto no Runway</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <Label className="text-xs text-muted-foreground">Pró-Labore Mensal (R$)</Label>
            <Input type="number" value={simProLabore} onChange={e => setSimProLabore(Number(e.target.value))} className="h-8 mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contratação Mensal (R$)</Label>
            <Input type="number" value={simContratacao} onChange={e => setSimContratacao(Number(e.target.value))} className="h-8 mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Investimento Único (R$)</Label>
            <Input type="number" value={simInvestimento} onChange={e => setSimInvestimento(Number(e.target.value))} className="h-8 mt-1" />
          </div>
        </div>
        {(simProLabore > 0 || simContratacao > 0 || simInvestimento > 0) && (
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Novo Burn Rate: </span>
                <span className="font-semibold">{formatCurrency(newBurnWithSim)}/mês</span>
              </div>
              <div>
                <span className="text-muted-foreground">Saldo após investimento: </span>
                <span className="font-semibold">{formatCurrency(saldoAfterInvestment)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Novo Runway: </span>
                <span className={`font-semibold ${runwaySim < 3 ? "text-destructive" : "text-success"}`}>
                  {runwaySim === Infinity ? "∞" : `${runwaySim.toFixed(1)} meses`}
                </span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Fluxo de Caixa Realizado vs Projetado</h2>
          <ChartContainer config={{
            realizado: { label: "Realizado", color: "hsl(var(--success))" },
            projetado: { label: "Projetado", color: "hsl(var(--primary))" },
          }} className="h-[280px]">
            <BarChart data={cashFlowChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="realizado" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="projetado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ChartContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Receita vs Despesas - Mensal</h2>
          <ChartContainer config={{
            receita: { label: "Receita", color: "hsl(var(--success))" },
            despesas: { label: "Despesas", color: "hsl(var(--destructive))" },
          }} className="h-[280px]">
            <LineChart data={cashFlowChart.map((m, i) => {
              const d2 = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
              const key = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}`;
              return {
                label: m.label,
                receita: recItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.pago ?? 0), 0),
                despesas: payItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.pago ?? 0), 0),
              };
            }).slice(0, 6)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Line type="monotone" dataKey="receita" stroke="hsl(var(--success))" strokeWidth={2} />
              <Line type="monotone" dataKey="despesas" stroke="hsl(var(--destructive))" strokeWidth={2} />
            </LineChart>
          </ChartContainer>
        </motion.div>
      </div>

      <CashIndicators recItems={recItems} payItems={payItems} saldoAtual={saldoAtual} burnRate={burnRate} />

      <AccountsDetail recItems={recItems} payItems={payItems} />

      <CashAlerts recItems={recItems} payItems={payItems} saldoAtual={saldoAtual} burnRate={burnRate} runway={runway} />
    </div>
  );
}
