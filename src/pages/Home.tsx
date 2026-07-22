import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { usePeriod } from "@/contexts/PeriodContext";
import { PeriodFilter } from "@/components/PeriodFilter";
import { useDeals } from "@/hooks/useDeals";
import { useTasks } from "@/hooks/useTasks";
import { useProjects, isFinalizado } from "@/hooks/useProjects";
import { useAllContaAzulCache, extractItems, useSyncContaAzul } from "@/hooks/useContaAzulCache";
import { useProjetosRealizados } from "@/hooks/useProjetosRealizados";
import { useMRR } from "@/hooks/useContratos";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { usePermissions } from "@/hooks/usePermissions";
import { NotificacoesCard } from "@/components/NotificacoesCard";
import {
  type CAItem, calcSaldoEmConta, calcBurnRate, calcReceitaTotal, calcReceitaRecebida,
  calcAReceberNoMes, calcAReceberVencidoNoMes, calcAPagarNoMes, calcPagamentosDoMes, pagamentosDoMesItems, calcEntradasPrevistasNoMes, calcRecebidoTotal,
  calcDespesasOperacionais,
  calcCustosFixos, calcCustosVariaveis, calcMargemContribuicao, calcLucroLiquido,
  calcLucroLiquidoFinal, calcTicketMedio, calcCustosFixosPorCategoria, calcPontoEquilibrio, calcPagoRealizado, calcTrailing,
  calcCustosVariaveisPorCategoria, calcImpostosSobreVenda, calcCustosDoProjeto, calcRetiradaSocios,
  calcMargemBruta, displayCat, getCat,
  receitaTotalItems, recebidoItems, aReceberNoMesItems,
  custosFixosItems, custosVariaveisItems, impostosSobreVendaItems,
} from "@/lib/financial";
import { DetailModal } from "@/components/financeiro/DetailModal";
import { PainelSinais } from "@/components/financeiro/PainelSinais";
import { gerarSinais, type SinalAcao } from "@/lib/sinais";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, Wallet, Clock, Handshake, Trophy, Target,
  CalendarDays, AlertTriangle, FileText, RefreshCw, ArrowRight, CheckCircle2,
  Inbox, Briefcase, Clapperboard, Receipt, Percent, PieChart, TrendingDown, CircleDollarSign, CreditCard, Scale, Banknote, ChevronRight,
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
  hero?: boolean;
  termo?: string; // termo técnico em cinza sob o rótulo amigável
  delta?: { texto: string; bom: boolean } | null; // variação vs período anterior
}

function MetricCard({ label, value, sub, subColor, valueColor, icon: Icon, onClick, loading, insight, regime, hero, termo, delta }: MetricCardProps) {
  return (
    <Card
      className={`border-border/50 transition-colors ${hero ? "bg-card/80" : "bg-card"} ${onClick ? "cursor-pointer hover:border-primary/40" : ""}`}
      onClick={onClick}
    >
      <CardContent className={hero ? "p-5" : "p-4"}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Icon className={`shrink-0 text-muted-foreground/60 ${hero ? "h-4 w-4" : "h-3.5 w-3.5"}`} />
          <span className={`text-muted-foreground truncate min-w-0 ${hero ? "text-xs" : "text-[11px]"}`}>{label}</span>
          {regime && (
            <span
              className={`ml-auto shrink-0 text-[9px] font-medium uppercase tracking-wider ${regime === "competência" ? "text-emerald-400/70" : "text-sky-400/70"}`}
              title={regime === "competência" ? "Regime de competência: conta no mês em que o fato aconteceu (base das margens)." : "Regime de caixa: conta no mês em que vence/paga (fluxo financeiro)."}
            >
              {regime}
            </span>
          )}
        </div>
        {termo && <p className="-mt-1 mb-1 text-[10px] text-muted-foreground/60 truncate">{termo}</p>}
        {loading ? (
          <Skeleton className={hero ? "h-9 w-32" : "h-6 w-24"} />
        ) : (
          <>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <p className={`font-heading font-bold truncate ${hero ? "text-2xl sm:text-3xl" : "text-lg"} ${valueColor || "text-foreground"}`}>{value}</p>
              {delta && (
                <span className={`shrink-0 text-[11px] font-medium ${delta.bom ? "text-green-400" : "text-destructive"}`}>{delta.texto}</span>
              )}
            </div>
            {sub && <p className={`mt-0.5 truncate ${hero ? "text-xs" : "text-[11px]"} ${subColor || "text-muted-foreground"}`}>{sub}</p>}
            {insight && <p className="text-[11px] mt-1.5 text-muted-foreground/70 leading-snug">{insight}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Section header (recolhível) ─── */
function SecHeader({ open, onToggle, dot, title, hint }: { open: boolean; onToggle: () => void; dot: string; title: string; hint?: string }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 py-1.5 text-left hover:opacity-80 transition-opacity">
      <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`} />
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {hint && <span className="ml-auto truncate text-[11px] text-muted-foreground/60">{hint}</span>}
    </button>
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
  const { canSeeMoney } = usePermissions();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { period, setPeriod } = usePeriod();
  const { mrr, contratos: nContratos } = useMRR();
  const { data: contexto } = useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async () => {
      // select("*") de propósito: resiliente a colunas novas ainda não migradas (coluna ausente vira undefined,
      // em vez de derrubar a query inteira e perder a âncora do saldo).
      const { data } = await (supabase as any).from("empresa_contexto").select("*").eq("id", 1).maybeSingle();
      return data as { meta_margem_liquida: number | null; meta_faturamento_mensal: number | null; saldo_inicial: number | null; saldo_inicial_data: string | null; horas_produtivas_mes?: number | null } | null;
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
    const active = projects.filter((p) => !isFinalizado(p.status));
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

  // Visão de produção (home) — contadores leves
  const { data: entregaveisAguardando = 0 } = useQuery({
    queryKey: ["home-entregaveis-aguardando"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("deliverables")
        .select("id", { count: "exact", head: true })
        .in("status", ["revisao_n1", "revisao_n2", "com_cliente"]);
      return count ?? 0;
    },
  });
  const { data: followupsHoje = 0 } = useQuery({
    queryKey: ["home-followups-hoje"],
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { count } = await (supabase as any)
        .from("follow_ups")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente")
        .lte("data_prevista", hoje);
      return count ?? 0;
    },
  });


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
  // Seções recolhíveis — tudo fechado por padrão (só status + 4 números no topo).
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const toggleSec = (k: string) => setAberto((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
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

  // Nº de meses cobertos pelo período (1 p/ mês, 6 p/ semestre, 12 p/ ano...) — usado pra escalar
  // métricas mensais (meta, custo hora) quando o período tem mais de um mês.
  const nMesesPeriodo = useMemo(() => {
    const [fy, fm] = monthPeriod.from.split("-").map(Number);
    const [ty, tm] = monthPeriod.to.split("-").map(Number);
    return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
  }, [monthPeriod.from, monthPeriod.to]);
  const faturamentoVsMeta = monthlyTarget > 0 ? (faturamentoMes / (monthlyTarget * nMesesPeriodo)) * 100 : 0;

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

  // Custo hora (automático): custos fixos do mês ÷ horas produtivas configuradas no Contexto.
  // "Cheio" = todas as despesas operacionais ÷ horas (referência de teto pra precificação).
  const horasMes = contexto?.horas_produtivas_mes ?? null;
  // Custo hora é por MÊS: usa custo fixo médio mensal do período ÷ horas mensais.
  const custoHora = horasMes && horasMes > 0 ? (custosFixos / nMesesPeriodo) / horasMes : null;
  const custoHoraCheio = horasMes && horasMes > 0 ? (despesasOp / nMesesPeriodo) / horasMes : null;

  // Geração de caixa do mês (caixa TOTAL, simétrica ao saldo): tudo que entrou − tudo que saiu,
  // incl. empréstimos dos dois lados (entrada de empréstimo conta; amortização também).
  const pagoMes = useMemo(() => calcPagoRealizado(payItems, monthPeriod), [payItems, monthPeriod.from, monthPeriod.to]);
  const recebidoTotalMes = useMemo(() => calcRecebidoTotal(recItems, monthPeriod), [recItems, monthPeriod.from, monthPeriod.to]);
  const geracaoCaixa = recebidoTotalMes - pagoMes;
  // Projetado: o mês completo, se tudo que vence se concretizar. Identidade:
  // projetado = realizado + (ainda a entrar) − (ainda a sair).
  const entradasPrevistas = useMemo(() => calcEntradasPrevistasNoMes(recItems, monthPeriod), [recItems, monthPeriod.from, monthPeriod.to]);
  const geracaoProjetada = entradasPrevistas - aPagarMes;
  const aindaEntrar = entradasPrevistas - recebidoTotalMes;
  const aindaSair = aPagarMes - pagoMes;

  // Tendência: 3 meses fechados antes do mês selecionado (margens estáveis, sem o mês parcial).
  const trailing = useMemo(() => calcTrailing(recItems, payItems, monthPeriod), [recItems, payItems, monthPeriod.from, monthPeriod.to]);
  const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const trailingLabel = trailing.meses.length
    ? `${MESES_CURTO[+trailing.meses[0].slice(5) - 1]}–${MESES_CURTO[+trailing.meses[trailing.meses.length - 1].slice(5) - 1]}/${trailing.meses[0].slice(2, 4)}`
    : "";

  // Status de saúde — segue o PERÍODO selecionado (margem líquida do período) + runway.
  // Caixa crítico (runway < 2m) nunca deixa um resultado positivo parecer 100% tranquilo.
  const statusSaude = useMemo(() => {
    const m = margemLiquida.pct;
    const caixaCurto = runway !== Infinity && runway < 2;
    let key: "saudavel" | "zero" | "atencao" | "prejuizo";
    if (m >= 8) key = "saudavel";
    else if (m >= -3) key = "zero";
    else if (m >= -15) key = "atencao";
    else key = "prejuizo";
    if (caixaCurto && (key === "saudavel" || key === "zero")) key = "atencao";
    const runwayTxt = runway === Infinity ? "∞" : `${runway.toFixed(1)}m`;
    const cfg = {
      saudavel: { label: "Lucrando e saudável", nota: "resultado positivo no período e caixa cobre o ritmo", icon: Trophy, cls: "border-green-500/40 bg-green-500/10", color: "text-green-400" },
      zero: { label: "No zero a zero", nota: "operação se paga no período, mas sem folga — margem ~0%", icon: Scale, cls: "border-amber-400/40 bg-amber-400/10", color: "text-amber-300" },
      atencao: { label: "Merece atenção", nota: m >= 0 ? `resultado positivo no período, mas caixa curto (runway ${runwayTxt}) — priorize cobrança` : "margem negativa leve no período: ajuste preço/custo antes que aperte", icon: AlertTriangle, cls: "border-orange-500/40 bg-orange-500/10", color: "text-orange-400" },
      prejuizo: { label: "No prejuízo", nota: "gastou mais do que entrou no período — corrija estrutura ou preço", icon: TrendingDown, cls: "border-destructive/40 bg-destructive/10", color: "text-destructive" },
    }[key];
    return { key, ...cfg };
  }, [margemLiquida.pct, runway]);

  // Geração de caixa mês a mês — FIXO: os 6 meses FECHADOS antes do mês corrente (ancorado em HOJE,
  // NÃO no seletor de período). É histórico: a geração de um mês passado não muda conforme o que se olha.
  const geracaoMensal = useMemo(() => {
    const y = now.getFullYear(), m = now.getMonth() + 1; // mês corrente (parcial, excluído)
    const rows: { mes: string; geracao: number }[] = [];
    for (let i = 6; i >= 1; i--) {
      let yy = y, mm = m - i;
      while (mm <= 0) { mm += 12; yy -= 1; }
      const key = `${yy}-${String(mm).padStart(2, "0")}`;
      const receb = recItems.filter((r) => r.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r.pago ?? 0), 0);
      const pag = payItems.filter((p) => p.data_vencimento?.startsWith(key)).reduce((s, p) => s + (p.pago ?? 0), 0);
      rows.push({ mes: MESES_CURTO[mm - 1], geracao: Math.round(receb - pag) });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recItems, payItems, now.getFullYear(), now.getMonth()]);

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
    toast({ title: "Copiado", description: "Cole no portal os 6 campos do período." });
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

  // ── Entradas previstas nos próximos 30 dias (janela à frente, p/ o sinal de oportunidade) ──
  const em30dias = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const entradas30d = useMemo(() => {
    const itens = (recItems as any[]).filter((r) => {
      const dv = r.data_vencimento;
      return dv && dv >= today && dv <= em30dias && (r.nao_pago ?? 0) > 0 && getCat(r) !== "Empréstimos de Bancos";
    });
    const total = itens.reduce((s, r) => s + (r.nao_pago ?? 0), 0);
    const top = itens.slice().sort((a, b) => (b.nao_pago ?? 0) - (a.nao_pago ?? 0))[0];
    return { total, top: top ? { cliente: top.cliente?.nome || "cliente", valor: top.nao_pago ?? 0 } : null, itens: itens as CAItem[] };
  }, [recItems, today, em30dias]);
  // Itens vencidos do "A receber" do período — mesma base do card, p/ o drill-down do sinal.
  const aReceberVencidoItems = useMemo(
    () => detItens.aReceber.filter((r) => r.data_vencimento && r.data_vencimento < today && (r.nao_pago ?? 0) > 0),
    [detItens, today],
  );

  // ── Variação vs período anterior (mesmo nº de meses, imediatamente antes) ──
  const periodoAnterior = useMemo(() => {
    const [fy, fm] = monthPeriod.from.split("-").map(Number);
    const baseIdx = fy * 12 + (fm - 1);
    const startIdx = baseIdx - nMesesPeriodo;
    const endIdx = baseIdx - 1;
    const sY = Math.floor(startIdx / 12), sM = ((startIdx % 12) + 12) % 12;
    const eY = Math.floor(endIdx / 12), eM = ((endIdx % 12) + 12) % 12;
    const lastDay = new Date(eY, eM + 1, 0).getDate();
    return { from: `${sY}-${String(sM + 1).padStart(2, "0")}-01`, to: `${eY}-${String(eM + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
  }, [monthPeriod.from, nMesesPeriodo]);
  const fatAnterior = useMemo(() => calcReceitaTotal(recItems, periodoAnterior), [recItems, periodoAnterior.from, periodoAnterior.to]);
  const resultadoAnterior = useMemo(() => calcLucroLiquido(fatAnterior, calcDespesasOperacionais(payItems, periodoAnterior)).valor, [payItems, fatAnterior, periodoAnterior.from, periodoAnterior.to]);
  const compactBRL = (n: number) => {
    const a = Math.abs(n);
    return a >= 1000 ? `R$ ${(n / 1000).toFixed(a >= 10000 ? 0 : 1).replace(".", ",")}k` : formatCurrency(n);
  };
  const deltaFaturamento = fatAnterior > 0
    ? { texto: `${faturamentoMes >= fatAnterior ? "▲" : "▼"} ${Math.abs(((faturamentoMes - fatAnterior) / fatAnterior) * 100).toFixed(0)}%`, bom: faturamentoMes >= fatAnterior }
    : null;
  const deltaResultadoVal = margemLiquida.valor - resultadoAnterior;
  const deltaResultado = (fatAnterior > 0 || resultadoAnterior !== 0)
    ? { texto: `${deltaResultadoVal >= 0 ? "▲" : "▼"} ${compactBRL(Math.abs(deltaResultadoVal))}`, bom: deltaResultadoVal >= 0 }
    : null;

  // ── Motor de sinais: recebe os valores JÁ auditados (nunca recalcula) ──
  const sinais = useMemo(() => gerarSinais({
    fmtMoeda: formatCurrency,
    fmtPct: formatPercent,
    margemLiquidaPct: margemLiquida.pct,
    margemLiquidaValor: margemLiquida.valor,
    metaMargem,
    faturamentoMes,
    faturamentoVsMeta,
    monthlyTarget,
    runway,
    burnRate,
    saldoConta,
    aReceberMes,
    aReceberMesVencido,
    aPagarMesAberto,
    abertoImpostos,
    fixPctReceita,
    custosFixos,
    geracaoCaixa,
    geracaoMensalValores: geracaoMensal.map((g) => g.geracao),
    trailingMargemLiquidaPct: trailing.margemLiquidaPct,
    trailingMargemCaixaPct: trailing.margemCaixaPct,
    faltaPraLucro,
    mrr,
    retiradaSocios,
    concentracaoTop3: topClientes.concentracao,
    entradas30dTotal: entradas30d.total,
    entradas30dTop: entradas30d.top,
    clientes: topClientes.lista,
    ticketMedio: ticketMedioValor,
  }), [margemLiquida.pct, margemLiquida.valor, metaMargem, faturamentoMes, faturamentoVsMeta, monthlyTarget, runway, burnRate, saldoConta, aReceberMes, aReceberMesVencido, aPagarMesAberto, abertoImpostos, fixPctReceita, custosFixos, geracaoCaixa, geracaoMensal, trailing, faltaPraLucro, mrr, retiradaSocios, topClientes, entradas30d, ticketMedioValor]);

  const handleSinalAcao = (a: SinalAcao) => {
    if (a.modal === "vencido") setDetalhe({ title: "A receber vencido", items: aReceberVencidoItems, valueField: "nao_pago" });
    else if (a.modal === "impostos") setDetalhe({ title: "Impostos sobre venda", items: detItens.impostos, valueField: "total" });
    else if (a.modal === "custosFixos") setDetalhe({ title: "Custos fixos", items: detItens.custosFixos, valueField: "total" });
    else if (a.modal === "entradas30d") setDetalhe({ title: "A entrar nos próximos 30 dias", items: entradas30d.itens, valueField: "nao_pago" });
    else if (a.rota) navigate(a.rota);
  };

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

      {/* Notificações não lidas — direto na cara */}
      <NotificacoesCard />

      {/* Ações rápidas */}
      <motion.div {...anim} className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: "Novo orçamento", icon: FileText, to: "/orcamentos/novo", primary: true },
          { label: "Projetos", icon: Clapperboard, to: "/projetos" },
          { label: "Apontar horas", icon: Clock, to: "/horas" },
          { label: "Follow-ups", icon: CalendarDays, to: "/follow-ups" },
          { label: "Faturamento", icon: Receipt, to: "/faturamento" },
          { label: "Minha mesa", icon: Inbox, to: "/minha-mesa" },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => navigate(a.to)}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors ${
              a.primary
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-border/50 bg-card text-foreground hover:border-primary/40"
            }`}
          >
            <a.icon className="h-5 w-5" />
            <span className="text-xs font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Produção */}
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-primary" /> Produção
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Orçamentos abertos" value={String(openDeals.length)} sub={formatCurrency(pipelineValue)} icon={FileText} onClick={() => navigate("/orcamentos")} />
          <MetricCard label="Projetos em andamento" value={String(productionMetrics.activeCount)} sub={formatCurrency(productionMetrics.receitaAberto)} icon={Clapperboard} onClick={() => navigate("/projetos")} />
          <MetricCard label="Entregáveis aguardando" value={String(entregaveisAguardando)} sub="revisão / aprovação" icon={Inbox} onClick={() => navigate("/minha-mesa")} />
          <MetricCard label="Follow-ups pra hoje" value={String(followupsHoje)} sub={followupsHoje > 0 ? "pendentes" : "em dia"} subColor={followupsHoje > 0 ? "text-amber-400" : "text-green-400"} icon={CalendarDays} onClick={() => navigate("/follow-ups")} />
        </div>
      </section>

      {/* Meu dia — quadro pessoal (cada um vê o que é seu) */}

      {/* FINANCEIRO */}
      <section className="space-y-5">
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

        {/* Saúde & sinais — recolhível por padrão (descongestiona a home) */}
        <div>
          <SecHeader
            open={aberto.has("sinais")}
            onToggle={() => toggleSec("sinais")}
            dot="bg-orange-400"
            title="Saúde do negócio & o que olhar agora"
            hint={statusSaude.label}
          />
          {aberto.has("sinais") && (
            <div className="mt-3 space-y-5">
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${statusSaude.cls}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/40 ${statusSaude.color}`}>
                  <statusSaude.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-heading text-lg font-bold leading-tight ${statusSaude.color}`}>{statusSaude.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {statusSaude.nota} · margem líquida do período {formatPercent(margemLiquida.pct)} · runway {runway === Infinity ? "∞" : `${runway.toFixed(1)} meses`}
                    {statusSaude.key === "prejuizo" && faltaPraLucro > 0 ? ` · faltam ${formatCurrency(faltaPraLucro)} de faturamento pra zerar` : ""}
                  </p>
                </div>
              </div>
              <PainelSinais sinais={sinais} onAcao={handleSinalAcao} loading={financialLoading} />
            </div>
          )}
        </div>

        {/* Resumo — os números-chave */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            hero
            label="Faturamento"
            regime="competência"
            value={formatCurrency(faturamentoMes)}
            delta={deltaFaturamento}
            sub={`${formatPercent(faturamentoVsMeta)} da meta`}
            subColor={faturamentoVsMeta >= 100 ? "text-green-400" : faturamentoVsMeta >= 60 ? "text-amber-400" : "text-destructive"}
            icon={TrendingUp}
            onClick={() => setDetalhe({ title: "Faturamento (NFs emitidas)", items: detItens.faturamento, valueField: "total" })}
            loading={financialLoading}
          />
          <MetricCard
            hero
            label="Resultado do período"
            regime="competência"
            value={formatCurrency(margemLiquida.valor)}
            valueColor={margemLiquida.valor >= 0 ? "text-green-400" : "text-destructive"}
            delta={deltaResultado}
            sub={margemLiquida.valor >= 0 ? "lucro" : "prejuízo"}
            icon={Target}
            onClick={() => navigate("/financeiro/resultados")}
            loading={financialLoading}
          />
          <MetricCard
            hero
            label="Saldo em conta"
            regime="caixa"
            value={formatCurrency(saldoConta)}
            icon={DollarSign}
            onClick={() => navigate("/financeiro/runway")}
            loading={financialLoading}
          />
          <MetricCard
            hero
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
        <div>
          <SecHeader open={aberto.has("resultado")} onToggle={() => toggleSec("resultado")} dot="bg-emerald-400" title="Resultado econômico · competência" hint={`margem líquida ${formatPercent(margemLiquida.pct)}`} />
          {aberto.has("resultado") && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <MetricCard label="Receita líquida" value={formatCurrency(receitaLiquida)} sub="receita − impostos" icon={CircleDollarSign} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Impostos sobre venda" value={formatCurrency(impostosVenda)} sub={abertoImpostos > 0 ? `${formatCurrency(abertoImpostos)} em aberto` : "tudo pago"} subColor={abertoImpostos > 0 ? "text-amber-400" : "text-green-400"} icon={Receipt} onClick={() => setDetalhe({ title: "Impostos sobre venda", items: detItens.impostos, valueField: "total" })} loading={financialLoading} />
          <MetricCard label="Custos fixos" value={formatCurrency(custosFixos)} sub={abertoFixos > 0 ? `${formatCurrency(abertoFixos)} em aberto` : "tudo pago"} subColor={abertoFixos > 0 ? "text-amber-400" : "text-green-400"} icon={Receipt} onClick={() => setDetalhe({ title: "Custos fixos", items: detItens.custosFixos, valueField: "total" })} loading={financialLoading} insight={insightCustosFixos} />
          <MetricCard label="Custos variáveis" value={formatCurrency(custosVariaveis)} sub={abertoVariaveis > 0 ? `${formatCurrency(abertoVariaveis)} em aberto` : "tudo pago"} subColor={abertoVariaveis > 0 ? "text-amber-400" : "text-green-400"} icon={TrendingDown} onClick={() => setDetalhe({ title: "Custos variáveis", items: detItens.custosVariaveis, valueField: "total" })} loading={financialLoading} />
          <MetricCard label="Sobra após custos diretos" termo="margem bruta" value={formatPercent(margemBruta.pct)} sub={formatCurrency(margemBruta.valor)} valueColor={marginColor(margemBruta.pct)} icon={TrendingUp} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Sobra após variáveis" termo="margem de contribuição" value={formatPercent(margemContrib.pct)} sub={formatCurrency(margemContrib.valor)} valueColor={marginColor(margemContrib.pct)} icon={Percent} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} insight={insightContrib} />
          <MetricCard label="Sobra no fim" termo="margem líquida" value={formatPercent(margemLiquida.pct)} sub={formatCurrency(margemLiquida.valor)} valueColor={marginColor(margemLiquida.pct)} icon={Target} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} insight={insightMargemLiq} />
          <MetricCard label="Faturamento pra empatar" termo="ponto de equilíbrio" value={formatCurrency(pontoEquilibrio)} sub={faltaPraLucro > 0 ? `faltam ${formatCurrency(faltaPraLucro)} pra zerar` : `no lucro (+${formatCurrency(-faltaPraLucro)})`} subColor={faltaPraLucro > 0 ? "text-amber-400" : "text-green-400"} icon={Scale} loading={financialLoading} />
          <MetricCard
            label="Custo da sua hora"
            termo="custo hora · estrutura"
            value={custoHora != null ? `${formatCurrency(custoHora)}/h` : "—"}
            sub={custoHora != null ? `${formatCurrency(custosFixos / nMesesPeriodo)}/mês ÷ ${horasMes}h produtivas` : "defina as horas produtivas no Contexto"}
            subColor={custoHora != null ? undefined : "text-amber-400"}
            icon={Clock}
            onClick={custoHora == null ? () => navigate("/configuracoes/contexto") : undefined}
            loading={financialLoading}
            insight={custoHoraCheio != null ? `cheio (todas as despesas op.): ${formatCurrency(custoHoraCheio)}/h` : undefined}
          />
          </div>
          )}
        </div>

        {/* Caixa (vencimento) */}
        <div>
          <SecHeader open={aberto.has("caixa")} onToggle={() => toggleSec("caixa")} dot="bg-sky-400" title="Caixa · vencimento" hint={`geração ${formatCurrency(geracaoCaixa)}`} />
          {aberto.has("caixa") && (
          <div className="space-y-3 mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard label="A receber" value={formatCurrency(aReceberMes)} sub={aReceberMesVencido > 0 ? `${formatCurrency(aReceberMesVencido)} vencido` : "a vencer no período"} subColor={aReceberMesVencido > 0 ? "text-destructive" : undefined} icon={Wallet} onClick={() => setDetalhe({ title: "A receber no período", items: detItens.aReceber, valueField: "nao_pago" })} loading={financialLoading} />
          <MetricCard label="Total a pagar" value={formatCurrency(aPagarMes)} sub={aPagarMesAberto > 0 ? `${formatCurrency(aPagarMesAberto)} ainda em aberto` : "tudo pago"} subColor={aPagarMesAberto > 0 ? "text-amber-400" : "text-green-400"} icon={CreditCard} onClick={() => setDetalhe({ title: "Total a pagar no período", items: detItens.aPagar, valueField: "total" })} loading={financialLoading} />
          <MetricCard label="Recebido (realizado)" value={formatCurrency(recebidoMes)} sub="recebido no período" subColor="text-green-400" icon={CircleDollarSign} onClick={() => setDetalhe({ title: "Recebido no período (realizado)", items: detItens.recebido, valueField: "pago" })} loading={financialLoading} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricCard label="Geração de caixa (realizado)" value={formatCurrency(geracaoCaixa)} valueColor={geracaoCaixa >= 0 ? "text-green-400" : "text-destructive"} sub={`entrou ${formatCurrency(recebidoTotalMes)} · saiu ${formatCurrency(pagoMes)}`} subColor={geracaoCaixa >= 0 ? "text-green-400" : "text-destructive"} icon={Banknote} loading={financialLoading} />
          <MetricCard label="Geração de caixa (projetado)" value={formatCurrency(geracaoProjetada)} valueColor={geracaoProjetada >= 0 ? "text-green-400" : "text-destructive"} sub={`período completo · ainda a entrar ${formatCurrency(aindaEntrar)} · ainda a sair ${formatCurrency(aindaSair)}`} subColor={geracaoProjetada >= 0 ? "text-green-400" : "text-destructive"} icon={TrendingUp} loading={financialLoading} />
        </div>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> Geração de caixa — últimos 6 meses fechados (fixo, não segue o seletor)
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
          </div>
          )}
        </div>

        {/* Comercial & operação */}
        <div>
          <SecHeader open={aberto.has("comercial")} onToggle={() => toggleSec("comercial")} dot="bg-primary" title="Comercial & operação" hint={`${topClientes.qtde} clientes · ${projetosRealizados} projetos`} />
          {aberto.has("comercial") && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <MetricCard label="MRR (receita recorrente)" value={formatCurrency(mrr)} sub={`${nContratos} contratos ativos`} icon={Wallet} onClick={() => navigate("/configuracoes/contratos")} loading={false} />
          <MetricCard label="Projetos realizados" value={String(projetosRealizados)} sub="no período (ClickUp)" icon={Briefcase} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Ticket médio" value={formatCurrency(ticketMedioValor)} sub={projetosRealizados > 0 ? `${projetosRealizados} projetos` : `${ticketMedio.qtde} faturas`} icon={TrendingUp} onClick={() => navigate("/financeiro/resultados")} loading={financialLoading} />
          <MetricCard label="Nº de clientes" value={String(topClientes.qtde)} sub="faturando no período" icon={Handshake} onClick={() => navigate("/clientes")} loading={financialLoading} insight={topClientes.concentracao > 50 ? `concentrado: top 3 = ${topClientes.concentracao.toFixed(0)}%` : undefined} />
          </div>
          )}
        </div>

        {/* Principais categorias de custo (mês) */}
        <div>
          <SecHeader open={aberto.has("categorias")} onToggle={() => toggleSec("categorias")} dot="bg-amber-400" title="Principais categorias de custo" hint={topCategoriasCusto.length ? `${topCategoriasCusto.length} categorias` : ""} />
          {aberto.has("categorias") && (
          <div className="space-y-2 mt-2 px-1">
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
          </div>
          )}
        </div>

        {/* Clientes: projetos × faturamento × ticket */}
        <div>
          <SecHeader open={aberto.has("clientes")} onToggle={() => toggleSec("clientes")} dot="bg-primary" title="Clientes — projetos × faturamento × ticket" hint={topClientes.qtde > 0 ? `${topClientes.qtde} clientes` : ""} />
          {aberto.has("clientes") && (
          <div className="mt-2 px-1">
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
          </div>
          )}
        </div>
      </section>

      <section>
        <SecHeader open={aberto.has("tendencia")} onToggle={() => toggleSec("tendencia")} dot="bg-violet-400" title={`Tendência — 3 meses fechados${trailingLabel ? ` (${trailingLabel})` : ""}`} hint={`líquida ${formatPercent(trailing.margemLiquidaPct)}`} />
        {aberto.has("tendencia") && (
          <div className="mt-2">
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
          </div>
        )}
      </section>

      <section>
        <SecHeader open={aberto.has("portal")} onToggle={() => toggleSec("portal")} dot="bg-primary" title="Portal do período" hint="6 campos pra copiar" />
        {aberto.has("portal") && (
          <div className="mt-2">
            <div className="mb-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={copiarPortal}>Copiar tudo</Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Números prontos pra alimentar o portal externo (período selecionado no topo). Pró-labore = retirada total dos sócios
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
          </div>
        )}
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

