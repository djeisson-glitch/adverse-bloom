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
import { useProjetosRealizados } from "@/hooks/useProjetosRealizados";
import { useMRR } from "@/hooks/useContratos";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import {
  type CAItem, calcSaldoEmConta, calcBurnRate, calcReceitaTotal, calcReceitaRecebida,
  calcAReceberNoMes, calcAReceberVencidoNoMes, calcAPagarNoMes, calcPagamentosDoMes, pagamentosDoMesItems,
  calcDespesasOperacionais,
  calcCustosFixos, calcCustosVariaveis, calcMargemContribuicao, calcLucroLiquido,
  calcLucroLiquidoFinal, calcTicketMedio, calcCustosFixosPorCategoria, calcPontoEquilibrio, calcPagoRealizado, calcTrailing,
  calcCustosVariaveisPorCategoria, calcImpostosSobreVenda, calcCustosDoProjeto, calcRetiradaSocios,
  calcMargemBruta, displayCat, getCat,
  receitaTotalItems, recebidoItems, aReceberNoMesItems,
  custosFixosItems, custosVariaveisItems, impostosSobreVendaItems,
} from "@/lib/financial";
import { DetailModal } from "@/components/financeiro/DetailModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, Wallet, Clock, Handshake, Trophy, Target,
  CalendarDays, AlertTriangle, FileText, RefreshCw, ArrowRight, CheckCircle2,
  Inbox, Briefcase, Clapperboard, Receipt, Percent, PieChart, TrendingDown, CircleDollarSign, CreditCard, Scale, Banknote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, Cell, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip } from "recharts";

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
  regime?: "competência" | "caixa";
}

function MetricCard({ label, value, sub, subColor, valueColor, icon: Icon, onClick, loading, insight, regime }: MetricCardProps) {
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
          <span className="text-xs text-muted-foreground truncate min-w-0">{label}</span>
          {regime && (
            <span
              className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${regime === "competência" ? "bg-emerald-500/10 text-emerald-400" : "bg-sky-500/10 text-sky-400"}`}
              title={regime === "competência" ? "Regime de competência: conta no mês em que o fato aconteceu (base das margens)." : "Regime de caixa: conta no mês em que vence/paga (fluxo financeiro)."}
            >
              {regime}
            </span>
          )}
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
  const { mrr, contratos: nContratos } = useMRR();
  const { data: contexto } = useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("empresa_contexto").select("meta_margem_liquida, meta_faturamento_mensal, saldo_inicial, saldo_inicial_data").eq("id", 1).maybeSingle();
      return data as { meta_margem_liquida: number | null; meta_faturamento_mensal: number | null; saldo_inicial: number | null; saldo_inicial_data: string | null } | null;
    },
  });
  const metaMargem = contexto?.meta_margem_liquida ?? null;
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
  const aReceberMes = useMemo(() => calcAReceberNoMes(recItems, monthPeriod), [recItems, monthPeriod.from, monthPeriod.to]);
  const aReceberMesVencido = useMemo(() => calcAReceberVencidoNoMes(recItems, monthPeriod, today), [recItems, monthPeriod.from, monthPeriod.to, today]);
  const aPagarMes = useMemo(() => calcPagamentosDoMes(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const aPagarMesAberto = useMemo(() => calcAPagarNoMes(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);

  // Drill-down: lançamentos do Conta Azul que somam cada card (lista = exatamente o que o número soma).
  const [detalhe, setDetalhe] = useState<{ title: string; items: CAItem[]; valueField: "total" | "pago" | "nao_pago" } | null>(null);
  const detItens = useMemo(() => ({
    faturamento: receitaTotalItems(recItems, monthPeriod),
    aReceber: aReceberNoMesItems(recItems, monthPeriod),
    aPagar: pagamentosDoMesItems(payItems, monthPeriod),
    recebido: recebidoItems(recItems, monthPeriod),
    custosFixos: custosFixosItems(payItems, monthPeriod),
    custosVariaveis: custosVariaveisItems(payItems, monthPeriod),
    impostos: impostosSobreVendaItems(payItems, monthPeriod),
  }), [recItems, payItems, monthPeriod.from, monthPeriod.to]);
  // Parcela ainda em aberto (nao_pago) de cada bloco de custo — mesmo modelo do "Total a pagar".
  const emAberto = (items: CAItem[]) => items.reduce((s, r) => s + (r?.nao_pago ?? 0), 0);
  const abertoFixos = useMemo(() => emAberto(detItens.custosFixos), [detItens]);
  const abertoVariaveis = useMemo(() => emAberto(detItens.custosVariaveis), [detItens]);
  const abertoImpostos = useMemo(() => emAberto(detItens.impostos), [detItens]);

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

  // Ponto de equilíbrio (competência): quanto precisa faturar pra zerar.
  // Margem de contribuição REAL = receita − impostos − custos variáveis (impostos escalam com a venda).
  const mcRealPct = faturamentoMes > 0 ? ((faturamentoMes - impostosVenda - custosVariaveis) / faturamentoMes) * 100 : 0;
  const pontoEquilibrio = useMemo(() => calcPontoEquilibrio(custosFixos, mcRealPct), [custosFixos, mcRealPct]);
  const faltaPraLucro = pontoEquilibrio - faturamentoMes;

  // Geração de caixa do mês (caixa): o que de fato entrou − o que de fato saiu.
  const pagoMes = useMemo(() => calcPagoRealizado(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const geracaoCaixa = recebidoMes - pagoMes;

  // Tendência: 3 meses fechados antes do mês selecionado (margens estáveis, sem o mês parcial).
  const trailing = useMemo(() => calcTrailing(recItems, payItems, monthPeriod), [recItems, payItems, monthPeriod.from, monthPeriod.to]);
  const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const trailingLabel = trailing.meses.length
    ? `${MESES_CURTO[+trailing.meses[0].slice(5) - 1]}–${MESES_CURTO[+trailing.meses[trailing.meses.length - 1].slice(5) - 1]}/${trailing.meses[0].slice(2, 4)}`
    : "";

  // Geração de caixa mês a mês (6 meses até o selecionado) — recebido − pago, por vencimento.
  const geracaoMensal = useMemo(() => {
    const [y, m] = monthPeriod.from.split("-").map(Number);
    const rows: { mes: string; geracao: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      let yy = y, mm = m - i;
      while (mm <= 0) { mm += 12; yy -= 1; }
      const key = `${yy}-${String(mm).padStart(2, "0")}`;
      const receb = recItems.filter((r) => r.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r.pago ?? 0), 0);
      const pag = payItems.filter((p) => p.data_vencimento?.startsWith(key)).reduce((s, p) => s + (p.pago ?? 0), 0);
      rows.push({ mes: MESES_CURTO[mm - 1], geracao: Math.round(receb - pag) });
    }
    return rows;
  }, [recItems, payItems, monthPeriod.from]);

  const ticketMedio = useMemo(() => calcTicketMedio(recItems, monthPeriod, faturamentoMes), [recItems, monthPeriod.from, monthPeriod.to, faturamentoMes]);
  // Projetos realizados (ClickUp) no período → ticket médio = faturamento ÷ projetos.
  const projetosRealizados = useProjetosRealizados(monthPeriod);
  const ticketMedioValor = projetosRealizados > 0 ? faturamentoMes / projetosRealizados : ticketMedio.valor;

  // Portal do mês — campos prontos pra copiar. Pró-labore = retirada total dos sócios
  // (pró-labore + distribuição); Custo fixo = custos fixos − essa retirada (só operacional).
  const retiradaSocios = useMemo(() => calcRetiradaSocios(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const custoFixoOperacional = custosFixos - retiradaSocios;
  const portalCampos = [
    { label: "Faturamento bruto", valor: formatCurrency(faturamentoMes) },
    { label: "Custo fixo", valor: formatCurrency(custoFixoOperacional) },
    { label: "Pró-labore", valor: formatCurrency(retiradaSocios) },
    { label: "Margem líquida", valor: formatPercent(margemLiquida.pct) },
    { label: "Caixa de reserva", valor: formatCurrency(saldoConta) },
    { label: "Nº de projetos fechados", valor: String(projetosRealizados) },
  ];
  const copiarPortal = () => {
    const txt = portalCampos.map((c) => `${c.label}: ${c.valor}`).join("\n");
    navigator.clipboard?.writeText(txt);
    toast({ title: "Copiado", description: "Cole no portal os 6 campos do mês." });
  };
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

  // Projetos por cliente (ClickUp) × faturamento (Conta Azul) × ticket médio
  const { data: projetosRaw } = useQuery({
    queryKey: ["clickup_projetos"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("clickup_cache").select("payload").eq("data_type", "projetos_finalizados").maybeSingle();
      return (data?.payload?.itens ?? []) as Array<{ cliente: string | null; data: string | null; concluido: boolean }>;
    },
  });
  const topClientes = useMemo(() => {
    const norm = (s: string) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const STOP = new Set(["DA", "DE", "DO", "DOS", "DAS", "E", "LTDA", "SA", "ME", "EPP", "SEDE", "RS", "MG", "SC", "COOPERATIVA", "CREDITO", "POUPANCA", "INVESTIMENTO"]);
    const toks = (s: string) => norm(s).split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
    const projByCli = new Map<string, number>();
    for (const p of projetosRaw ?? []) {
      if (!p.concluido || !p.cliente || !p.data || p.data < monthPeriod.from || p.data > monthPeriod.to) continue;
      projByCli.set(p.cliente, (projByCli.get(p.cliente) ?? 0) + 1);
    }
    const cliToks = [...projByCli.keys()].map((k) => ({ k, t: toks(k) }));
    const fatByCli = new Map<string, number>();
    let total = 0;
    for (const r of recItems as any[]) {
      if (getCat(r) === "Empréstimos de Bancos") continue;
      const dc = r.data_competencia;
      if (!dc || dc < monthPeriod.from || dc > monthPeriod.to) continue;
      const v = r.total ?? 0; total += v;
      const ct = toks(r.cliente?.nome || "");
      let best: string | null = null, bestN = 0;
      for (const c of cliToks) { const n = c.t.filter((t) => ct.includes(t)).length; if (n > bestN) { bestN = n; best = c.k; } }
      if (best && bestN >= 1) fatByCli.set(best, (fatByCli.get(best) ?? 0) + v);
    }
    const lista = [...projByCli.entries()]
      .map(([nome, proj]) => { const fat = fatByCli.get(nome) ?? 0; return { nome, proj, fat, ticket: proj > 0 ? fat / proj : 0 }; })
      .sort((a, b) => b.proj - a.proj).slice(0, 8);
    const top3 = [...fatByCli.values()].sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
    return { lista, qtde: projByCli.size, concentracao: total > 0 ? (top3 / total) * 100 : 0 };
  }, [recItems, projetosRaw, monthPeriod.from, monthPeriod.to]);

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
        {/* Resumo — os números-chave */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Faturamento do mês"
            regime="competência"
            value={formatCurrency(faturamentoMes)}
            sub={`${formatPercent(faturamentoVsMeta)} da meta`}
            subColor={faturamentoVsMeta >= 100 ? "text-green-400" : faturamentoVsMeta >= 60 ? "text-amber-400" : "text-destructive"}
            icon={TrendingUp}
            onClick={() => setDetalhe({ title: "Faturamento do mês (NFs emitidas)", items: detItens.faturamento, valueField: "total" })}
            loading={financialLoading}
          />
          <MetricCard
            label="Resultado do período"
            regime="competência"
            value={formatCurrency(margemLiquida.valor)}
            valueColor={margemLiquida.valor >= 0 ? "text-green-400" : "text-destructive"}
            sub={margemLiquida.valor >= 0 ? "lucro" : "prejuízo"}
            icon={Target}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
          />
          <MetricCard
            label="Saldo em conta"
            regime="caixa"
            value={formatCurrency(saldoConta)}
            icon={DollarSign}
            onClick={() => navigate("/financeiro/runway")}
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

        {/* Resultado econômico (competência) */}
        <div className="flex items-center gap-2 pt-3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resultado econômico</h3>
          <span className="text-[10px] uppercase tracking-wide text-emerald-400/70">competência</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Receita líquida" value={formatCurrency(receitaLiquida)} sub="receita − impostos" icon={CircleDollarSign} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Impostos sobre venda" value={formatCurrency(impostosVenda)} sub={abertoImpostos > 0 ? `${formatCurrency(abertoImpostos)} em aberto` : "tudo pago"} subColor={abertoImpostos > 0 ? "text-amber-400" : "text-green-400"} icon={Receipt} onClick={() => setDetalhe({ title: "Impostos sobre venda (mês)", items: detItens.impostos, valueField: "total" })} loading={financialLoading} />
          <MetricCard label="Custos fixos" value={formatCurrency(custosFixos)} sub={abertoFixos > 0 ? `${formatCurrency(abertoFixos)} em aberto` : "tudo pago"} subColor={abertoFixos > 0 ? "text-amber-400" : "text-green-400"} icon={Receipt} onClick={() => setDetalhe({ title: "Custos fixos do mês", items: detItens.custosFixos, valueField: "total" })} loading={financialLoading} insight={insightCustosFixos} />
          <MetricCard label="Custos variáveis" value={formatCurrency(custosVariaveis)} sub={abertoVariaveis > 0 ? `${formatCurrency(abertoVariaveis)} em aberto` : "tudo pago"} subColor={abertoVariaveis > 0 ? "text-amber-400" : "text-green-400"} icon={TrendingDown} onClick={() => setDetalhe({ title: "Custos variáveis do mês", items: detItens.custosVariaveis, valueField: "total" })} loading={financialLoading} />
          <MetricCard label="Margem bruta" value={formatPercent(margemBruta.pct)} sub={formatCurrency(margemBruta.valor)} valueColor={marginColor(margemBruta.pct)} icon={TrendingUp} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Margem de contribuição" value={formatPercent(margemContrib.pct)} sub={formatCurrency(margemContrib.valor)} valueColor={marginColor(margemContrib.pct)} icon={Percent} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} insight={insightContrib} />
          <MetricCard label="Margem líquida" value={formatPercent(margemLiquida.pct)} sub={formatCurrency(margemLiquida.valor)} valueColor={marginColor(margemLiquida.pct)} icon={Target} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} insight={insightMargemLiq} />
          <MetricCard label="Ponto de equilíbrio" value={formatCurrency(pontoEquilibrio)} sub={faltaPraLucro > 0 ? `faltam ${formatCurrency(faltaPraLucro)} pra zerar` : `no lucro (+${formatCurrency(-faltaPraLucro)})`} subColor={faltaPraLucro > 0 ? "text-amber-400" : "text-green-400"} icon={Scale} loading={financialLoading} />
        </div>

        {/* Caixa (vencimento) */}
        <div className="flex items-center gap-2 pt-3">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caixa</h3>
          <span className="text-[10px] uppercase tracking-wide text-sky-400/70">vencimento</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="A receber no mês" value={formatCurrency(aReceberMes)} sub={aReceberMesVencido > 0 ? `${formatCurrency(aReceberMesVencido)} vencido` : "a vencer no mês"} subColor={aReceberMesVencido > 0 ? "text-destructive" : undefined} icon={Wallet} onClick={() => setDetalhe({ title: "A receber no mês", items: detItens.aReceber, valueField: "nao_pago" })} loading={financialLoading} />
          <MetricCard label="Total a pagar no mês" value={formatCurrency(aPagarMes)} sub={aPagarMesAberto > 0 ? `${formatCurrency(aPagarMesAberto)} ainda em aberto` : "tudo pago"} subColor={aPagarMesAberto > 0 ? "text-amber-400" : "text-green-400"} icon={CreditCard} onClick={() => setDetalhe({ title: "A pagar no mês", items: detItens.aPagar, valueField: "nao_pago" })} loading={financialLoading} />
          <MetricCard label="Recebido (realizado)" value={formatCurrency(recebidoMes)} sub="recebido no mês" subColor="text-green-400" icon={CircleDollarSign} onClick={() => setDetalhe({ title: "Recebido no mês (realizado)", items: detItens.recebido, valueField: "pago" })} loading={financialLoading} />
          <MetricCard label="Geração de caixa (mês)" value={formatCurrency(geracaoCaixa)} valueColor={geracaoCaixa >= 0 ? "text-green-400" : "text-destructive"} sub={`entrou ${formatCurrency(recebidoMes)} · saiu ${formatCurrency(pagoMes)}`} subColor={geracaoCaixa >= 0 ? "text-green-400" : "text-destructive"} icon={Banknote} loading={financialLoading} />
        </div>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> Geração de caixa — mês a mês (recebido − pago)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={geracaoMensal} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <RTooltip
                  cursor={{ fill: "hsl(var(--secondary))", opacity: 0.3 }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [formatCurrency(Number(v)), "Geração"]}
                />
                <Bar dataKey="geracao" radius={[4, 4, 0, 0]}>
                  {geracaoMensal.map((d, i) => (
                    <Cell key={i} fill={d.geracao >= 0 ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Comercial & operação */}
        <div className="flex items-center gap-2 pt-3">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comercial &amp; operação</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="MRR (receita recorrente)" value={formatCurrency(mrr)} sub={`${nContratos} contratos ativos`} icon={Wallet} onClick={() => navigate("/configuracoes/contratos")} loading={false} />
          <MetricCard label="Projetos realizados" value={String(projetosRealizados)} sub="no período (ClickUp)" icon={Briefcase} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Ticket médio" value={formatCurrency(ticketMedioValor)} sub={projetosRealizados > 0 ? `${projetosRealizados} projetos` : `${ticketMedio.qtde} faturas`} icon={TrendingUp} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Nº de clientes" value={String(topClientes.qtde)} sub="faturando no período" icon={Handshake} onClick={() => navigate("/clientes")} loading={financialLoading} insight={topClientes.concentracao > 50 ? `concentrado: top 3 = ${topClientes.concentracao.toFixed(0)}%` : undefined} />
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

        {/* Clientes: projetos × faturamento × ticket */}
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              <Handshake className="h-3.5 w-3.5" /> Clientes — projetos × faturamento × ticket (período)
              {topClientes.qtde > 0 && (
                <span className="ml-auto text-[11px] text-muted-foreground/80">{topClientes.qtde} clientes</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {topClientes.lista.length === 0 ? (
              <EmptyState icon={Handshake} message="Sem projetos no período" />
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="font-medium pb-1">Cliente</th>
                    <th className="font-medium pb-1 text-right">Projetos</th>
                    <th className="font-medium pb-1 text-right">Faturamento</th>
                    <th className="font-medium pb-1 text-right">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {topClientes.lista.map((c) => (
                    <tr key={c.nome} className="border-t border-border/30">
                      <td className="py-1.5 truncate max-w-[150px]">{c.nome}</td>
                      <td className="py-1.5 text-right">{c.proj}</td>
                      <td className="py-1.5 text-right text-primary font-semibold">{formatCurrency(c.fat)}</td>
                      <td className="py-1.5 text-right">{c.ticket > 0 ? formatCurrency(c.ticket) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Tendência — 3 meses fechados {trailingLabel && <span className="text-xs font-normal text-muted-foreground">({trailingLabel})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Médias dos 3 meses completos antes do mês selecionado — sem o ruído do mês parcial. Ambas <strong>operacionais</strong>
              (excluem empréstimos e compra de equipamentos), então a diferença entre elas é só o <strong>timing</strong> (competência × caixa).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Margem líquida (3m) <span className="text-[9px] uppercase text-emerald-400">comp.</span></p>
                <p className={`text-lg font-heading font-bold ${marginColor(trailing.margemLiquidaPct)}`}>{formatPercent(trailing.margemLiquidaPct)}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Margem de caixa (3m) <span className="text-[9px] uppercase text-sky-400">caixa</span></p>
                <p className={`text-lg font-heading font-bold ${trailing.margemCaixaPct >= 0 ? "text-green-400" : "text-destructive"}`}>{formatPercent(trailing.margemCaixaPct)}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Geração de caixa média/mês <span className="text-[9px] uppercase text-sky-400">caixa</span></p>
                <p className={`text-lg font-heading font-bold ${trailing.geracaoCaixaMedia >= 0 ? "text-green-400" : "text-destructive"}`}>{formatCurrency(trailing.geracaoCaixaMedia)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Portal do mês
            </CardTitle>
            <Button size="sm" variant="outline" onClick={copiarPortal}>Copiar tudo</Button>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Números prontos pra alimentar o portal externo (mês selecionado no topo). Pró-labore = retirada total dos sócios
              (pró-labore + distribuição); custo fixo = só operacional (sem a retirada).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {portalCampos.map((c) => (
                <div key={c.label} className="rounded-lg border border-border/40 bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                  <p className="text-lg font-heading font-bold">{c.valor}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {detalhe && (
        <DetailModal
          open={!!detalhe}
          onOpenChange={(o) => !o && setDetalhe(null)}
          title={detalhe.title}
          items={detalhe.items}
          valueField={detalhe.valueField}
        />
      )}
    </div>
  );
}
