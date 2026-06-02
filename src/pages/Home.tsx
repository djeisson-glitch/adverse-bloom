import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { usePeriod } from "@/contexts/PeriodContext";
import { PeriodFilter } from "@/components/PeriodFilter";
import { useDeals } from "@/hooks/useDeals";
import { useTasks } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useAllContaAzulCache, extractItems, useSyncContaAzul } from "@/hooks/useContaAzulCache";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import {
  type CAItem, calcSaldoEmConta, calcBurnRate, calcReceitaTotal, calcReceitaRecebida,
  calcDespesasOperacionais,
  calcCustosFixos, calcCustosVariaveis, calcMargemContribuicao, calcLucroLiquido,
  calcLucroLiquidoFinal, calcTicketMedio, calcCustosFixosPorCategoria,
  calcCustosVariaveisPorCategoria, calcImpostosSobreVenda, calcCustosDoProjeto,
  calcMargemBruta, displayCat, getCat,
} from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, Wallet, Clock, Handshake, Trophy, Target,
  CalendarDays, AlertTriangle, FileText, RefreshCw, ArrowRight, CheckCircle2,
  Inbox, Briefcase, Clapperboard, Receipt, Percent, PieChart, TrendingDown, CircleDollarSign,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/* ─── Metric Card ─── */
interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  valueColor?: string;
  icon: React.ElementType;
  onClick?: () => void;
  loading?: boolean;
  insight?: string;
}

function MetricCard({ label, value, sub, subColor, valueColor, icon: Icon, onClick, loading, insight }: MetricCardProps) {
  return (
    <Card
      className="bg-card border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="text-xs text-muted-foreground truncate">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <>
            <p className={`text-lg sm:text-xl font-heading font-bold truncate ${valueColor || "text-foreground"}`}>{value}</p>
            {sub && <p className={`text-xs mt-0.5 truncate ${subColor || "text-muted-foreground"}`}>{sub}</p>}
            {insight && <p className="text-[11px] mt-1.5 text-muted-foreground/80 leading-snug">💡 {insight}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Empty State ─── */
function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
      <Icon className="h-5 w-5 opacity-50" />
      <p className="text-xs text-center">{message}</p>
    </div>
  );
}

export default function Home() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { period, setPeriod } = usePeriod();
  const { data: contexto } = useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("empresa_contexto").select("meta_margem_liquida, meta_faturamento_mensal, saldo_inicial, saldo_inicial_data").eq("id", 1).maybeSingle();
      return data as { meta_margem_liquida: number | null; meta_faturamento_mensal: number | null; saldo_inicial: number | null; saldo_inicial_data: string | null } | null;
    },
  });
  const metaMargem = contexto?.meta_margem_liquida ?? null;
  const { data: clickupProjetos } = useQuery({
    queryKey: ["clickup_projetos"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("clickup_cache").select("payload").eq("data_type", "projetos_finalizados").maybeSingle();
      return (data?.payload?.itens ?? []) as Array<{ data: string | null; concluido: boolean }>;
    },
  });
  const firstName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "usuário";
  const { deals } = useDeals();
  const { allTasks } = useTasks("__all__");
  const { accounts, receivables, payables } = useAllContaAzulCache();
  const [syncing, setSyncing] = useState(false);
  const { data: allProjectsData } = useProjects();

  // Production metrics
  const productionMetrics = useMemo(() => {
    const projects = allProjectsData || [];
    const active = projects.filter((p) => p.status !== "faturado");
    const receitaAberto = active.reduce((s, p) => s + ((p as any).contract_value || p.sold_value || 0), 0);
    const last90 = new Date(Date.now() - 90 * 86400000);
    const recent = projects.filter((p) => new Date(p.created_at) >= last90);
    const ticketMedio = recent.length > 0
      ? recent.reduce((s, p) => s + ((p as any).contract_value || p.sold_value || 0), 0) / recent.length
      : 0;
    return { activeCount: active.length, receitaAberto, ticketMedio };
  }, [allProjectsData]);

  const financialLoading = receivables.isLoading || payables.isLoading;

  // Budgets query
  const budgetsQuery = useQuery({
    queryKey: ["budgets-home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("is_latest_version", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const budgets = budgetsQuery.data || [];

  // Commercial settings for monthly target
  const settingsQuery = useQuery({
    queryKey: ["commercial-settings-home"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commercial_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const monthlyTarget = settingsQuery.data?.monthly_target || 200000;

  // ===== FINANCEIRO =====
  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const saldoConta = useMemo(() => calcSaldoEmConta(recItems, payItems, contexto?.saldo_inicial, contexto?.saldo_inicial_data), [recItems, payItems, contexto?.saldo_inicial, contexto?.saldo_inicial_data]);
  const burnRate = useMemo(() => calcBurnRate(payItems), [payItems]);
  const runway = burnRate > 0 ? saldoConta / burnRate : Infinity;
  const runwayColor = runway > 4 ? "text-green-400" : runway >= 2 ? "text-amber-400" : "text-destructive";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // Todas as métricas financeiras respeitam o período do seletor no topo.
  const monthPeriod = period;
  const faturamentoMes = useMemo(
    () => calcReceitaTotal(recItems, monthPeriod),
    [recItems, monthPeriod.from, monthPeriod.to],
  );

  const today = now.toISOString().slice(0, 10);
  const aReceber = useMemo(() => {
    return recItems
      .filter(
        (r) =>
          r?.data_vencimento &&
          r.data_vencimento >= today &&
          r?.status !== "RECEIVED" &&
          getCat(r) !== "Empréstimos de Bancos",
      )
      .reduce((s, r) => s + (r?.total ?? 0), 0);
  }, [recItems, today]);

  const faturamentoVsMeta = monthlyTarget > 0 ? (faturamentoMes / monthlyTarget) * 100 : 0;

  // KPIs financeiros (mês atual) — reusam src/lib/financial.ts
  const recebidoMes = useMemo(() => calcReceitaRecebida(recItems, monthPeriod), [recItems, monthPeriod.from, monthPeriod.to]);
  const custosFixos = useMemo(() => calcCustosFixos(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const custosVariaveis = useMemo(() => calcCustosVariaveis(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const margemContrib = useMemo(() => calcMargemContribuicao(faturamentoMes, custosVariaveis), [faturamentoMes, custosVariaveis]);
  const impostosVenda = useMemo(() => calcImpostosSobreVenda(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const custosProjeto = useMemo(() => calcCustosDoProjeto(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const receitaLiquida = faturamentoMes - impostosVenda;
  // Margem bruta = venda − impostos sobre venda − custos do projeto (definição do dono)
  const margemBruta = useMemo(() => calcMargemBruta(faturamentoMes, impostosVenda, custosProjeto), [faturamentoMes, impostosVenda, custosProjeto]);
  const despesasOp = useMemo(() => calcDespesasOperacionais(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  // Margem líquida operacional = receita − despesas operacionais (exclui empréstimos, compra de equipamentos e juros). Tudo por competência.
  const margemLiquida = useMemo(() => calcLucroLiquido(faturamentoMes, despesasOp), [faturamentoMes, despesasOp]);
  const ticketMedio = useMemo(() => calcTicketMedio(recItems, monthPeriod, faturamentoMes), [recItems, monthPeriod.from, monthPeriod.to, faturamentoMes]);
  // Projetos realizados (ClickUp) no período → ticket médio = faturamento ÷ projetos.
  const projetosRealizados = useMemo(
    () => (clickupProjetos ?? []).filter((p) => p.concluido && p.data && p.data >= monthPeriod.from && p.data <= monthPeriod.to).length,
    [clickupProjetos, monthPeriod.from, monthPeriod.to],
  );
  const ticketMedioValor = projetosRealizados > 0 ? faturamentoMes / projetosRealizados : ticketMedio.valor;
  const topCategoriasCusto = useMemo(() => {
    const fix = calcCustosFixosPorCategoria(payItems, monthPeriod);
    const vari = calcCustosVariaveisPorCategoria(payItems, monthPeriod);
    // Unifica categorias exibidas (ex.: Pró-labore + Distribuição → "Salário")
    const map = new Map<string, number>();
    for (const [cat, val] of [...fix, ...vari]) {
      const name = displayCat(cat);
      map.set(name, (map.get(name) ?? 0) + val);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [payItems, monthPeriod.from, monthPeriod.to]);
  const marginColor = (pct: number) => (pct >= 20 ? "text-green-400" : pct >= 0 ? "text-amber-400" : "text-destructive");

  // Mini-insights por card (regras simples sobre os dados do período)
  const fixPctReceita = faturamentoMes > 0 ? (custosFixos / faturamentoMes) * 100 : 0;
  const insightCustosFixos = faturamentoMes > 0 ? `${fixPctReceita.toFixed(0)}% do faturamento` : undefined;
  const insightMargemLiq = metaMargem != null
    ? `${margemLiquida.pct - metaMargem >= 0 ? "+" : ""}${(margemLiquida.pct - metaMargem).toFixed(0)} pts vs meta de ${metaMargem}%`
    : (margemLiquida.pct < 0 ? "operação no vermelho" : undefined);
  const insightRunway = runway === Infinity ? undefined : runway < 2 ? "crítico — caixa p/ < 2 meses" : runway < 4 ? "atenção — reforce o caixa" : "saudável";
  const insightContrib = faturamentoMes > 0 ? `cobre ${margemContrib.pct.toFixed(0)}% além do custo variável` : undefined;
  const insightFaturamento = metaMargem == null && contexto?.meta_faturamento_mensal
    ? `meta: ${formatCurrency(contexto.meta_faturamento_mensal)}`
    : undefined;

  // ===== COMERCIAL =====
  const openDeals = deals.filter((d) => !["fechamento", "perdido"].includes(d.stage));
  const pipelineValue = openDeals.reduce((s, d) => s + (d.approved_value ?? 0), 0);

  const wonThisMonth = useMemo(() => {
    return deals.filter((d) => {
      if (d.stage !== "fechamento") return false;
      const upd = d.updated_at ? new Date(d.updated_at) : null;
      return upd && upd >= monthStart;
    });
  }, [deals, monthStart]);

  const dealsThisMonth = useMemo(() => {
    return deals.filter((d) => {
      const c = d.created_at ? new Date(d.created_at) : null;
      return c && c >= monthStart;
    });
  }, [deals, monthStart]);

  const conversionRate = dealsThisMonth.length > 0 ? (wonThisMonth.length / dealsThisMonth.length) * 100 : 0;

  const nextClosing = useMemo(() => {
    return openDeals
      .filter((d) => d.expected_close_date)
      .sort((a, b) => new Date(a.expected_close_date!).getTime() - new Date(b.expected_close_date!).getTime())
      .slice(0, 3);
  }, [openDeals]);

  // ===== OPERACIONAL =====
  const overdueTasks = useMemo(() => {
    return allTasks.filter((t) => !t.completed && t.due_date && t.due_date <= today).slice(0, 5);
  }, [allTasks, today]);

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const staleDrafts = useMemo(() => {
    return budgets.filter((b) => b.status === "draft" && b.updated_at < threeDaysAgo);
  }, [budgets, threeDaysAgo]);

  const recentBudgets = budgets.slice(0, 3);

  const syncContaAzul = useSyncContaAzul();

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncContaAzul();
      toast({ title: "Dados sincronizados com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const anim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div {...anim} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {getGreeting()}, <span className="text-primary">{firstName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>
      </motion.div>

      {/* FINANCEIRO */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Financeiro
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/financeiro")}
            className="text-xs text-muted-foreground"
          >
            Ver detalhes <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Faturamento do mês"
            value={formatCurrency(faturamentoMes)}
            sub={`${formatPercent(faturamentoVsMeta)} da meta`}
            subColor={
              faturamentoVsMeta >= 100
                ? "text-green-400"
                : faturamentoVsMeta >= 60
                  ? "text-amber-400"
                  : "text-destructive"
            }
            icon={TrendingUp}
            onClick={() => navigate("/financeiro")}
            loading={financialLoading}
          />
          <MetricCard
            label="A receber"
            value={formatCurrency(aReceber)}
            sub="vencimentos futuros"
            icon={Wallet}
            onClick={() => navigate("/financeiro/fluxo")}
            loading={financialLoading}
          />
          <MetricCard
            label="Saldo em conta"
            value={formatCurrency(saldoConta)}
            icon={DollarSign}
            onClick={() => navigate("/financeiro/runway")}
            loading={financialLoading}
          />
          <MetricCard
            label="Recebido (realizado)"
            value={formatCurrency(recebidoMes)}
            sub="recebido no mês"
            subColor="text-green-400"
            icon={CircleDollarSign}
            onClick={() => navigate("/financeiro/fluxo")}
            loading={financialLoading}
          />
          <MetricCard
            label="Custos fixos"
            value={formatCurrency(custosFixos)}
            icon={Receipt}
            onClick={() => navigate("/financeiro/custos")}
            loading={financialLoading}
            insight={insightCustosFixos}
          />
          <MetricCard
            label="Custos variáveis"
            value={formatCurrency(custosVariaveis)}
            icon={TrendingDown}
            onClick={() => navigate("/financeiro/custos")}
            loading={financialLoading}
          />
          <MetricCard
            label="Margem de contribuição"
            value={formatPercent(margemContrib.pct)}
            sub={formatCurrency(margemContrib.valor)}
            valueColor={marginColor(margemContrib.pct)}
            icon={Percent}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
            insight={insightContrib}
          />
          <MetricCard
            label="Margem bruta"
            value={formatPercent(margemBruta.pct)}
            sub={formatCurrency(margemBruta.valor)}
            valueColor={marginColor(margemBruta.pct)}
            icon={TrendingUp}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
          />
          <MetricCard
            label="Margem líquida"
            value={formatPercent(margemLiquida.pct)}
            sub={formatCurrency(margemLiquida.valor)}
            valueColor={marginColor(margemLiquida.pct)}
            icon={Target}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
            insight={insightMargemLiq}
          />
          <MetricCard
            label="Projetos realizados"
            value={String(projetosRealizados)}
            sub="no período (ClickUp)"
            icon={Briefcase}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
          />
          <MetricCard
            label="Ticket médio"
            value={formatCurrency(ticketMedioValor)}
            sub={projetosRealizados > 0 ? `${projetosRealizados} projetos` : `${ticketMedio.qtde} faturas`}
            icon={TrendingUp}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
          />
          <MetricCard
            label="Receita líquida"
            value={formatCurrency(receitaLiquida)}
            sub="receita − impostos"
            icon={CircleDollarSign}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
          />
          <MetricCard
            label="Impostos sobre venda"
            value={formatCurrency(impostosVenda)}
            icon={Receipt}
            onClick={() => navigate("/financeiro/custos")}
            loading={financialLoading}
          />
          <MetricCard
            label="Resultado do período"
            value={formatCurrency(margemLiquida.valor)}
            valueColor={margemLiquida.valor >= 0 ? "text-green-400" : "text-destructive"}
            sub={margemLiquida.valor >= 0 ? "lucro" : "prejuízo"}
            icon={Target}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
          />
          <MetricCard
            label="Runway"
            value={runway === Infinity ? "∞" : `${runway.toFixed(1)} meses`}
            valueColor={runwayColor}
            icon={Clock}
            onClick={() => navigate("/financeiro/runway")}
            loading={financialLoading}
            insight={insightRunway}
          />
        </div>

        {/* Principais categorias de custo (mês) */}
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5" /> Principais categorias de custo (mês)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {topCategoriasCusto.length === 0 ? (
              <EmptyState icon={PieChart} message="Sem custos no período" />
            ) : (
              topCategoriasCusto.map(([cat, valor]) => (
                <div key={cat} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate min-w-0">{cat}</span>
                  <span className="font-semibold text-primary shrink-0">{formatCurrency(valor)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
