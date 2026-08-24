import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle, FileText, Timer, LayoutList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useDeals } from "@/hooks/useDeals";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { useEmpresaContexto } from "@/hooks/useEmpresaContexto";
import { ResumoDoDia } from "@/components/ResumoDoDia";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { hojeISO } from "@/lib/dataLocal";
import {
  type CAItem, calcReceitaTotal, calcSaldoEmConta, calcAPagarVencido,
} from "@/lib/financial";

/**
 * Início — cinco números e uma lista.
 *
 * A tela anterior tinha 26 MetricCards e oito seções sanfonadas que, abertas,
 * despejavam 33 números — incluindo um terceiro "faturamento pra empatar",
 * diferente dos outros dois pontos de equilíbrio do sistema.
 *
 * Djêisson (23/08/2026): "é apenas 1 olhando pra tudo e outras duas olhando
 * para a operação apenas... precisamos das informações certas, simples, que
 * resolvem praticamente tudo."
 *
 * Uma tela inicial responde "o que eu faço agora?", não "como está tudo?". O
 * "como está tudo" tem endereço: /financeiro. Aqui ficam o recado do dia, se o
 * mês fecha, se tem caixa, e o que está parado esperando alguém.
 */

type Meta = { mes: string; break_even: number; meta: number };

function mesAtual() {
  const h = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0);
  return {
    from: `${h.getFullYear()}-${p(h.getMonth() + 1)}-01`,
    to: `${fim.getFullYear()}-${p(fim.getMonth() + 1)}-${p(fim.getDate())}`,
  };
}

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** Uma linha do que está parado. Número, o que é, e para onde ir. */
function Travado({ n, oque, detalhe, para, tom = "neutro" }: {
  n: number; oque: string; detalhe?: string; para: string; tom?: "neutro" | "atencao";
}) {
  const navigate = useNavigate();
  if (n === 0) return null;
  return (
    <button onClick={() => navigate(para)}
      className="w-full flex items-center gap-4 px-4 py-3 text-left border-b last:border-b-0 hover:bg-muted/50 transition-colors">
      <span className={`font-mono tabular-nums text-2xl font-medium w-12 shrink-0 ${
        tom === "atencao" ? "text-amber-600" : ""}`}>{n}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm">{oque}</span>
        {detalhe && <span className="block text-xs text-muted-foreground">{detalhe}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export default function Inicio() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { canSeeMoney } = usePermissions();
  const { receivables, payables } = useAllContaAzulCache();
  const { data: ctx } = useEmpresaContexto();
  const { data: deals = [] } = useDeals();
  const periodo = useMemo(mesAtual, []);

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const { data: metas = [] } = useQuery({
    queryKey: ["metas-12m"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("metas_12m").select("*").order("mes");
      if (error) throw error;
      return (data ?? []) as Meta[];
    },
    enabled: canSeeMoney,
  });

  const { data: aguardando = 0 } = useQuery({
    queryKey: ["inicio-entregaveis-aguardando"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("deliverables").select("id", { count: "exact", head: true })
        .in("status", ["revisao_n1", "revisao_n2", "com_cliente"]);
      return count ?? 0;
    },
  });

  const { data: followups = 0 } = useQuery({
    queryKey: ["inicio-followups-hoje"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("follow_ups").select("id", { count: "exact", head: true })
        .eq("status", "pendente").lte("data_prevista", hojeISO());
      return count ?? 0;
    },
  });

  const abertos = deals.filter((d: any) => !["fechamento", "perdido"].includes(d.stage));
  const pipeline = abertos.reduce((s: number, d: any) => s + (d.approved_value ?? 0), 0);

  const meta = metas.find((m) => String(m.mes).slice(0, 7) === periodo.from.slice(0, 7)) ?? null;
  const faturado = useMemo(() => calcReceitaTotal(recItems, periodo), [recItems, periodo]);
  const saldo = useMemo(
    () => calcSaldoEmConta(recItems, payItems, ctx?.saldo_inicial, ctx?.saldo_inicial_data),
    [recItems, payItems, ctx],
  );
  const vencido = useMemo(() => calcAPagarVencido(payItems, hojeISO()), [payItems]);

  const falta = meta ? meta.break_even - faturado : null;
  const pct = meta && meta.meta > 0 ? Math.min(100, (faturado / meta.meta) * 100) : 0;
  const pctBE = meta && meta.meta > 0 ? (meta.break_even / meta.meta) * 100 : 0;
  const tom = falta === null ? "neutro" : falta <= 0 ? "bom" : "atencao";

  const nome = (profile?.full_name || user?.email?.split("@")[0] || "").split(" ")[0];
  const data = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">
          {saudacao()}, <span className="text-primary">{nome}</span>
        </h1>
        <p className="text-sm text-muted-foreground capitalize">{data}</p>
      </div>

      <ResumoDoDia />

      {canSeeMoney && (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border bg-card p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">O mês</p>
            <p className="font-mono tabular-nums text-3xl font-medium mt-0.5">{formatCurrency(faturado)}</p>
            {meta ? (
              <>
                <p className={`text-sm mt-1 ${tom === "bom" ? "text-emerald-600" : "text-amber-600"}`}>
                  {falta! > 0 ? `faltam ${formatCurrency(falta!)} para o mês fechar` : "o mês já fecha"}
                </p>
                <div className="relative h-2 rounded-full bg-muted overflow-hidden mt-3">
                  <div className={`absolute inset-y-0 left-0 rounded-full ${
                    tom === "bom" ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${pctBE}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  equilíbrio {formatCurrency(meta.break_even)} · meta {formatCurrency(meta.meta)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">sem meta cadastrada para este mês</p>
            )}
          </section>

          <section className="rounded-lg border bg-card p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Caixa</p>
            <p className={`font-mono tabular-nums text-3xl font-medium mt-0.5 ${saldo < 0 ? "text-red-600" : ""}`}>
              {formatCurrency(saldo)}
            </p>
            {vencido > 0 ? (
              <p className="text-sm text-amber-600 mt-1 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {formatCurrency(vencido)} vencido e não pago
              </p>
            ) : (
              <p className="text-sm text-emerald-600 mt-1">nada vencido</p>
            )}
            <button onClick={() => navigate("/financeiro")}
              className="text-sm text-primary hover:underline mt-3 inline-flex items-center gap-1.5">
              Ver o financeiro <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </section>
        </div>
      )}

      <section className="rounded-lg border bg-card overflow-hidden">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-4 pt-4 pb-2">
          O que está esperando alguém
        </p>
        <Travado n={aguardando} oque="entregáveis em revisão ou com o cliente"
          detalhe="parados até alguém aprovar" para="/minha-mesa" tom="atencao" />
        <Travado n={abertos.length} oque="orçamentos abertos"
          detalhe={`${formatCurrency(pipeline)} em jogo`} para="/orcamentos" />
        <Travado n={followups} oque="follow-ups vencidos" para="/follow-ups" tom="atencao" />
        {aguardando === 0 && abertos.length === 0 && followups === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nada parado. Bom sinal.</p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/orcamentos/novo")}>
          <FileText className="h-4 w-4 mr-2" /> Novo orçamento
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/horas")}>
          <Timer className="h-4 w-4 mr-2" /> Apontar horas
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/minha-mesa")}>
          <LayoutList className="h-4 w-4 mr-2" /> Minha mesa
        </Button>
      </div>
    </div>
  );
}
