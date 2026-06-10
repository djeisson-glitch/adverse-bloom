import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { type CAItem, calcSaldoEmConta, getCat, STATUS_NAO_RECEBIVEL } from "@/lib/financial";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Sparkles, Loader2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const sevColor: Record<string, string> = {
  alta: "border-destructive/40 bg-destructive/10 text-destructive",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-primary/30 bg-primary/10 text-primary",
};

interface AiOut {
  resumo: string;
  alertas: { titulo: string; descricao: string; severidade: string; impacto: string }[];
  oportunidades: { titulo: string; descricao: string; potencial: string }[];
  acoes: { acao: string; prazo: string; impacto: string }[];
}

export default function FluxoDeCaixa() {
  const { receivables, payables } = useAllContaAzulCache();
  const { toast } = useToast();
  const [ai, setAi] = useState<AiOut | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);
  const { data: contexto } = useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("empresa_contexto").select("saldo_inicial, saldo_inicial_data").eq("id", 1).maybeSingle();
      return data as { saldo_inicial: number | null; saldo_inicial_data: string | null } | null;
    },
  });
  const saldoAtual = useMemo(
    () => calcSaldoEmConta(recItems, payItems, contexto?.saldo_inicial, contexto?.saldo_inicial_data),
    [recItems, payItems, contexto?.saldo_inicial, contexto?.saldo_inicial_data],
  );

  const qc = useQueryClient();
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [saldoInput, setSaldoInput] = useState("");
  const diasAncora = contexto?.saldo_inicial_data
    ? Math.floor((Date.now() - new Date(contexto.saldo_inicial_data).getTime()) / 86400000)
    : null;
  const salvarSaldo = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("empresa_contexto").upsert({
        id: 1, saldo_inicial: Number(saldoInput), saldo_inicial_data: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["empresa_contexto"] }); setEditandoSaldo(false); toast({ title: "Saldo atualizado" }); },
    onError: (e: any) => toast({ title: "Erro ao salvar saldo", description: e.message, variant: "destructive" }),
  });

  const today = new Date().toISOString().slice(0, 10);

  // Recebíveis/pagáveis FUTUROS (em aberto, por vencimento)
  const futurosRec = useMemo(
    () => recItems.filter((r: any) => r?.data_vencimento && r.data_vencimento >= today && (r?.nao_pago ?? r?.total ?? 0) > 0 && !STATUS_NAO_RECEBIVEL.includes(r?.status ?? "") && getCat(r) !== "Empréstimos de Bancos"),
    [recItems, today],
  );
  const futurosPay = useMemo(
    () => payItems.filter((p: any) => p?.data_vencimento && p.data_vencimento >= today && (p?.nao_pago ?? p?.total ?? 0) > 0),
    [payItems, today],
  );

  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const sumIn = (items: any[], to: string) => items.filter((i) => i.data_vencimento <= to).reduce((s, i) => s + (i.total ?? 0), 0);
  const aReceber90 = sumIn(futurosRec, inDays(90));
  const aPagar90 = sumIn(futurosPay, inDays(90));

  // Projeção mês a mês (próximos 6 meses), saldo acumulado
  const projecao = useMemo(() => {
    const now = new Date();
    const rows: { mes: string; receber: number; pagar: number; saldoProjetado: number; negativo: boolean }[] = [];
    let saldo = saldoAtual;
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const receber = futurosRec.filter((r) => r.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r.total ?? 0), 0);
      const pagar = futurosPay.filter((p) => p.data_vencimento?.startsWith(key)).reduce((s, p) => s + (p.total ?? 0), 0);
      saldo = saldo + receber - pagar;
      rows.push({ mes: `${MESES[d.getMonth()]}/${d.getFullYear()}`, receber, pagar, saldoProjetado: saldo, negativo: saldo < 0 });
    }
    return rows;
  }, [futurosRec, futurosPay, saldoAtual]);

  const primeiroNegativo = projecao.find((r) => r.negativo);

  const analisar = async () => {
    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: {
          fluxoData: {
            saldoAtual,
            aReceber90,
            aPagar90,
            meses: projecao.map((r) => ({ mes: r.mes, receber: r.receber, pagar: r.pagar, saldoProjetado: r.saldoProjetado })),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAi(data as AiOut);
    } catch (e: any) {
      toast({ title: "Erro na análise", description: e.message, variant: "destructive" });
    } finally {
      setLoadingAi(false);
    }
  };

  if (receivables.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Fluxo de Caixa</h1>
        <p className="text-sm text-muted-foreground">Projeção do caixa e recomendações de ação</p>
      </div>

      {primeiroNegativo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Caixa fica negativo em {primeiroNegativo.mes}</p>
            <p className="text-xs text-muted-foreground">Saldo projetado: {formatCurrency(primeiroNegativo.saldoProjetado)} — aja antes disso.</p>
          </div>
        </motion.div>
      )}

      {/* Âncora de saldo (use o saldo do Conta Azul) */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/50 p-3 text-sm flex-wrap">
        <div>
          <span className="text-muted-foreground">Saldo ancorado (Conta Azul): </span>
          <span className="font-semibold">{contexto?.saldo_inicial != null ? formatCurrency(contexto.saldo_inicial) : "não definido"}</span>
          {diasAncora != null && (
            <span className={`ml-2 text-xs ${diasAncora > 30 ? "text-warning" : "text-muted-foreground"}`}>
              (há {diasAncora} dias{diasAncora > 30 ? " — confira no CA" : ""})
            </span>
          )}
        </div>
        {editandoSaldo ? (
          <div className="flex items-center gap-2">
            <Input type="number" value={saldoInput} onChange={(e) => setSaldoInput(e.target.value)} placeholder="Saldo de hoje" className="h-8 w-36" />
            <Button size="sm" onClick={() => salvarSaldo.mutate()} disabled={salvarSaldo.isPending}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditandoSaldo(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setSaldoInput(String(contexto?.saldo_inicial ?? "")); setEditandoSaldo(true); }}>Atualizar saldo</Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Saldo atual" value={formatCurrency(saldoAtual)} icon={Wallet} delay={0} />
        <StatCard title="A receber (90d)" value={formatCurrency(aReceber90)} icon={TrendingUp} delay={0.1} changeType="positive" />
        <StatCard title="A pagar (90d)" value={formatCurrency(aPagar90)} icon={TrendingDown} delay={0.2} changeType="negative" />
        <StatCard title="Saldo projetado (90d)" value={formatCurrency(projecao[2]?.saldoProjetado ?? saldoAtual)} icon={Wallet} delay={0.3} changeType={(projecao[2]?.saldoProjetado ?? 0) >= 0 ? "positive" : "negative"} />
      </div>

      {/* Projeção mês a mês */}
      <div className="glass-card p-5">
        <h2 className="font-heading text-lg font-semibold mb-3">Projeção — próximos 6 meses</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 font-medium">Mês</th>
                <th className="pb-2 font-medium text-right">A receber</th>
                <th className="pb-2 font-medium text-right">A pagar</th>
                <th className="pb-2 font-medium text-right">Saldo projetado</th>
              </tr>
            </thead>
            <tbody>
              {projecao.map((r) => (
                <tr key={r.mes} className="border-b border-border/40">
                  <td className="py-2.5">{r.mes}</td>
                  <td className="py-2.5 text-right text-green-400">{formatCurrency(r.receber)}</td>
                  <td className="py-2.5 text-right text-destructive">{formatCurrency(r.pagar)}</td>
                  <td className={`py-2.5 text-right font-semibold ${r.negativo ? "text-destructive" : "text-foreground"}`}>{formatCurrency(r.saldoProjetado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* IA de caixa */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Análise de caixa (IA)
          </h2>
          <Button onClick={analisar} disabled={loadingAi} size="sm">
            {loadingAi ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {loadingAi ? "Analisando..." : "Analisar caixa"}
          </Button>
        </div>

        {!ai && !loadingAi && <p className="text-sm text-muted-foreground">Clique em "Analisar caixa" para recomendações de ação sobre o seu fluxo.</p>}

        {ai && (
          <div className="space-y-4">
            <div className="glass-card p-4 border-l-4 border-primary/50"><p className="text-sm font-medium">{ai.resumo}</p></div>

            {ai.alertas?.length > 0 && (
              <div className="space-y-2">
                {ai.alertas.map((a, i) => (
                  <div key={i} className={`p-3 rounded-lg text-sm border ${sevColor[a.severidade] || sevColor.baixa}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-semibold">{a.titulo}</p>
                      <Badge variant={a.severidade === "alta" ? "destructive" : a.severidade === "media" ? "default" : "secondary"} className="text-[10px] uppercase">{a.severidade}</Badge>
                    </div>
                    <p className="mt-1 opacity-90">{a.descricao}</p>
                    {a.impacto && <p className="mt-1.5 text-xs font-semibold">Impacto: {a.impacto}</p>}
                  </div>
                ))}
              </div>
            )}

            {ai.acoes?.length > 0 && (
              <div>
                <h3 className="font-heading text-sm font-semibold mb-2 flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Ações recomendadas</h3>
                <div className="space-y-2">
                  {ai.acoes.map((a, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-secondary/40 text-sm">
                      <span>{a.acao}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{a.prazo}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
