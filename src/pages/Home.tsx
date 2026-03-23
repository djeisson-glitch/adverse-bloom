import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useDeals } from "@/hooks/useDeals";
import { useTasks } from "@/hooks/useTasks";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import {
  type CAItem, calcSaldoEmConta, calcBurnRate, calcReceitaTotal, getCat,
} from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, TrendingUp, Wallet, Clock, Handshake, Trophy, Target,
  CalendarDays, AlertTriangle, FileText, RefreshCw, ArrowRight, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function Home() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const firstName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "usuário";
  const { deals } = useDeals();
  const { allTasks } = useTasks("__all__");
  const { accounts, receivables, payables } = useAllContaAzulCache();
  const [syncing, setSyncing] = useState(false);

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
      const { data, error } = await supabase
        .from("commercial_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const monthlyTarget = settingsQuery.data?.monthly_target || 200000;

  // ===== FINANCEIRO =====
  const accountItems = extractItems(accounts.data?.payload);
  const receivableItems = extractItems(receivables.data?.payload);

  const saldoConta = useMemo(() => {
    return accountItems.reduce((s: number, a: any) => s + (a.balance || a.saldo || 0), 0);
  }, [accountItems]);

  const aReceber = useMemo(() => {
    return receivableItems
      .filter((r: any) => r.status !== "paid" && r.status !== "pago")
      .reduce((s: number, r: any) => s + (r.value || r.valor || 0), 0);
  }, [receivableItems]);

  // Faturamento mês (deals ganhos no mês)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const wonThisMonth = useMemo(() => {
    return deals.filter((d) => {
      if (d.stage !== "ganho") return false;
      const upd = d.updated_at ? new Date(d.updated_at) : null;
      return upd && upd >= monthStart;
    });
  }, [deals, monthStart]);

  const faturamentoMes = wonThisMonth.reduce((s, d) => s + (d.value || 0), 0);
  const faturamentoVsMeta = monthlyTarget > 0 ? (faturamentoMes / monthlyTarget) * 100 : 0;

  // Runway rough estimate
  const approvedBudgets = budgets.filter((b) => b.status === "approved");
  const avgMonthlyExpense = approvedBudgets.length > 0
    ? approvedBudgets.reduce((s, b) => s + (b.total_value || 0), 0) / Math.max(approvedBudgets.length, 1)
    : 50000;
  const runway = avgMonthlyExpense > 0 ? saldoConta / avgMonthlyExpense : 0;
  const runwayColor = runway > 4 ? "text-green-400" : runway >= 2 ? "text-amber-400" : "text-destructive";

  // ===== COMERCIAL =====
  const openDeals = deals.filter((d) => !["ganho", "perdido"].includes(d.stage));
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);

  const dealsThisMonth = useMemo(() => {
    return deals.filter((d) => {
      const c = d.created_at ? new Date(d.created_at) : null;
      return c && c >= monthStart;
    });
  }, [deals, monthStart]);

  const conversionRate = dealsThisMonth.length > 0
    ? (wonThisMonth.length / dealsThisMonth.length) * 100
    : 0;

  const nextClosing = useMemo(() => {
    return openDeals
      .filter((d) => d.expected_close_date)
      .sort((a, b) => new Date(a.expected_close_date!).getTime() - new Date(b.expected_close_date!).getTime())
      .slice(0, 3);
  }, [openDeals]);

  // ===== OPERACIONAL =====
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = useMemo(() => {
    return allTasks
      .filter((t) => !t.completed && t.due_date && t.due_date <= today)
      .slice(0, 5);
  }, [allTasks, today]);

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const staleDrafts = useMemo(() => {
    return budgets.filter((b) => b.status === "draft" && b.updated_at < threeDaysAgo);
  }, [budgets, threeDaysAgo]);

  const recentBudgets = budgets.slice(0, 3);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("ca-sync-full");
      if (error) toast({ title: "Erro ao sincronizar", variant: "destructive" });
      else toast({ title: "Sincronizado!" });
    } catch {
      toast({ title: "Erro ao sincronizar", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const anim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div {...anim} className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {getGreeting()}, <span className="text-primary">{firstName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar"}
        </Button>
      </motion.div>

      {/* FINANCEIRO */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Financeiro
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/financeiro")} className="text-xs text-muted-foreground">
            Ver detalhes <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Faturamento do mês"
            value={formatCurrency(faturamentoMes)}
            sub={`${formatPercent(faturamentoVsMeta)} da meta`}
            subColor={faturamentoVsMeta >= 100 ? "text-green-400" : faturamentoVsMeta >= 60 ? "text-amber-400" : "text-destructive"}
            icon={TrendingUp}
            onClick={() => navigate("/financeiro")}
          />
          <MetricCard
            label="A receber"
            value={formatCurrency(aReceber)}
            sub="vencimentos futuros"
            icon={Wallet}
            onClick={() => navigate("/financeiro/fluxo")}
          />
          <MetricCard
            label="Saldo em conta"
            value={formatCurrency(saldoConta)}
            icon={DollarSign}
            onClick={() => navigate("/financeiro/runway")}
          />
          <MetricCard
            label="Runway"
            value={`${runway.toFixed(1)} meses`}
            valueColor={runwayColor}
            icon={Clock}
            onClick={() => navigate("/financeiro/runway")}
          />
        </div>
      </section>

      {/* COMERCIAL */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" /> Comercial
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/comercial")} className="text-xs text-muted-foreground">
            Ver pipeline <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Deals abertos"
            value={String(openDeals.length)}
            sub={formatCurrency(pipelineValue)}
            subColor="text-primary"
            icon={Handshake}
            onClick={() => navigate("/comercial")}
          />
          <MetricCard
            label="Ganhos no mês"
            value={String(wonThisMonth.length)}
            sub={formatCurrency(faturamentoMes)}
            subColor="text-green-400"
            icon={Trophy}
            onClick={() => navigate("/comercial")}
          />
          <MetricCard
            label="Taxa de conversão"
            value={formatPercent(conversionRate)}
            valueColor={conversionRate >= 30 ? "text-green-400" : conversionRate >= 15 ? "text-amber-400" : "text-muted-foreground"}
            icon={Target}
            onClick={() => navigate("/comercial")}
          />
          <Card className="bg-card border-border/50 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/comercial")}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Próximos fechamentos
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {nextClosing.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum deal com data prevista</p>
              ) : (
                nextClosing.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[120px] font-medium">{d.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-primary font-semibold">{formatCurrency(d.value || 0)}</span>
                      <span className="text-muted-foreground">{formatDate(d.expected_close_date)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* OPERACIONAL */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Operacional
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tarefas vencidas */}
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Tarefas vencidas / vencendo hoje
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {overdueTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Tudo em dia!
                </p>
              ) : (
                overdueTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[180px]">{t.title}</span>
                    <span className="text-destructive shrink-0">{formatDate(t.due_date)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Orçamentos aguardando */}
          <Card className="bg-card border-border/50 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/orcamentos")}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" /> Aguardando aprovação ({staleDrafts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {staleDrafts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum rascunho pendente</p>
              ) : (
                staleDrafts.slice(0, 3).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[140px] font-medium">#{b.budget_number} — {b.client_name}</span>
                    <span className="text-primary font-semibold shrink-0">{formatCurrency(b.total_value || 0)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Últimos orçamentos */}
          <Card className="bg-card border-border/50 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/orcamentos")}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Últimos orçamentos
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {recentBudgets.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum orçamento ainda</p>
              ) : (
                recentBudgets.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[140px] font-medium">#{b.budget_number} — {b.client_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-primary font-semibold">{formatCurrency(b.total_value || 0)}</span>
                      <Badge variant={b.status === "approved" ? "default" : "outline"} className="text-[10px] px-1.5 h-4">
                        {b.status === "approved" ? "Aprovado" : "Rascunho"}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  valueColor?: string;
  icon: React.ElementType;
  onClick?: () => void;
}

function MetricCard({ label, value, sub, subColor, valueColor, icon: Icon, onClick }: MetricCardProps) {
  return (
    <Card
      className="bg-card border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-xl font-heading font-bold ${valueColor || "text-foreground"}`}>{value}</p>
        {sub && <p className={`text-xs mt-0.5 ${subColor || "text-muted-foreground"}`}>{sub}</p>}
      </CardContent>
    </Card>
  );
}
