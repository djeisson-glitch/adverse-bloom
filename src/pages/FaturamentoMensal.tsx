import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, TrendingUp, TrendingDown,
  Clock, FileText, MessageSquareWarning, Users, AlertTriangle, Wallet, CheckCircle2, Info, Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useConfirm } from "@/components/ui/confirm";
import { mesISO, primeiroDiaISO } from "@/lib/dataLocal";

type Fatura = {
  id: string;
  client_id: string;
  ref_mes: string;
  modelo: string;
  horas_edicao: number;
  horas_alteracao: number;
  valor_hora: number;
  subtotal: number;
  margem_percent: number;
  margem_valor: number;
  imposto_percent: number;
  imposto_valor: number;
  total: number;
  detalhe: any;
  status: string;
  client?: { name: string } | null;
};

const MODELO_LABEL: Record<string, string> = { horas: "Por hora", tabela: "Tabela", contrato: "Contrato" };
const STATUS: Record<string, { label: string; cls: string; next?: string; nextLabel?: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground", next: "revisado", nextLabel: "Marcar revisado" },
  revisado: { label: "Revisado", cls: "bg-blue-500/20 text-info border-blue-500/30", next: "enviado", nextLabel: "Marcar enviado" },
  enviado: { label: "Enviado", cls: "bg-amber-500/20 text-warning border-amber-500/30", next: "faturado", nextLabel: "Marcar faturado" },
  faturado: { label: "Faturado", cls: "bg-emerald-500/20 text-success border-emerald-500/30" },
};


/**
 * Hora em formato de relógio, não em decimal.
 *
 * "0,12h" e "3,47h" obrigam a fazer conta de cabeça pra saber que são 7min e
 * 3h28. Abaixo de uma hora mostra só os minutos; acima, hora + minuto.
 */
/** 7 vira "7", 0.5 vira "0,5" — meia diária é rotina. */
function qtd(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

function fmtHoras(h: number) {
  const min = Math.round((h || 0) * 60);
  if (min === 0) return "0h";
  if (min < 60) return `${min}min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

export default function FaturamentoMensal() {
  const qc = useQueryClient();
  const confirmar = useConfirm();
  // padrão: mês anterior (é o que o dia 01 fatura)
  const [ref, setRef] = useState(() => mesISO(-1));
  const [aberto, setAberto] = useState<string | null>(null);

  const mesLabel = useMemo(() => {
    const [y, m] = ref.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [ref]);

  const { data: faturas = [], isLoading } = useQuery({
    queryKey: ["faturamento_mensal", ref],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("faturamento_mensal")
        .select("*, client:clients(name)")
        .eq("ref_mes", ref)
        .order("total", { ascending: false });
      if (error) throw error;
      return data as Fatura[];
    },
  });

  /**
   * Onde estão as horas, de verdade.
   *
   * A tela abre no MÊS ANTERIOR (é o que se fatura). Quando esse mês está
   * vazio — como no começo do uso do sistema — a tela mostra R$ 0,00 e parece
   * quebrada, sem dizer que as horas existem, só que noutro mês. E pior:
   * hora de cliente SEM faturamento configurado não entra em rascunho
   * nenhum e some sem ninguém ver. Estes dois avisos existem por isso.
   */
  const { data: panorama } = useQuery({
    queryKey: ["faturamento-panorama"],
    queryFn: async () => {
      const [te, proj, cli, cfg] = await Promise.all([
        (supabase as any).from("time_entries").select("project_id, start_at, duration_min").eq("billable", true),
        (supabase as any).from("projects").select("id, client_id"),
        (supabase as any).from("clients").select("id, name"),
        (supabase as any).from("client_faturamento").select("client_id, modelo"),
      ]);
      const clienteDoProjeto = new Map<string, string>();
      for (const p of proj.data || []) if (p.client_id) clienteDoProjeto.set(p.id, p.client_id);
      const nomeCliente = new Map<string, string>((cli.data || []).map((c: any) => [c.id, c.name]));
      const configurado = new Set<string>(
        (cfg.data || []).filter((c: any) => c.modelo && c.modelo !== "nenhum").map((c: any) => c.client_id),
      );

      const minPorMes = new Map<string, number>();
      const semConfig = new Map<string, number>();   // cliente → minutos no mês exibido
      for (const t of te.data || []) {
        const mes = (t.start_at || "").slice(0, 7);
        if (!mes) continue;
        minPorMes.set(mes, (minPorMes.get(mes) || 0) + (t.duration_min || 0));

        const cid = clienteDoProjeto.get(t.project_id);
        if (cid && !configurado.has(cid) && mes === ref.slice(0, 7)) {
          semConfig.set(cid, (semConfig.get(cid) || 0) + (t.duration_min || 0));
        }
      }
      return {
        meses: [...minPorMes.entries()].filter(([, m]) => m > 0).sort((a, b) => b[0].localeCompare(a[0])),
        semConfig: [...semConfig.entries()].map(([id, min]) => ({ nome: nomeCliente.get(id) || "Cliente", horas: min / 60 })),
      };
    },
  });

  /**
   * Saldo que cada cliente tem A USAR.
   *
   * Aparece aqui porque é na hora de fechar o mês que ele importa: cobrar
   * cheio de quem ainda tem crédito é o erro que o saldo existe pra evitar.
   */
  const { data: saldos = {} } = useQuery({
    queryKey: ["client_saldo_todos"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_saldo").select("*");
      const m: Record<string, { valor: number; edicoes: number; diarias: number }> = {};
      for (const s of data || []) m[s.client_id] = { valor: Number(s.valor), edicoes: Number(s.edicoes), diarias: Number(s.diarias) };
      return m;
    },
  });
  const saldoDe = (id: string) => {
    const s = (saldos as any)[id];
    if (!s || (!s.valor && !s.edicoes && !s.diarias)) return null;
    return [
      s.valor ? formatCurrency(s.valor) : null,
      s.edicoes ? `${qtd(s.edicoes)} ediç${Math.abs(s.edicoes) > 1 ? "ões" : "ão"}` : null,
      s.diarias ? `${qtd(s.diarias)} diária${Math.abs(s.diarias) > 1 ? "s" : ""}` : null,
    ].filter(Boolean).join(" · ");
  };

  const { data: precos = {} } = useQuery({
    queryKey: ["client_precos_todos"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_precos").select("client_id, tipo, preco, horas_ref, ordem").eq("ativo", true).order("ordem");
      const m: Record<string, any[]> = {};
      for (const p of data || []) (m[p.client_id] = m[p.client_id] || []).push(p);
      return m;
    },
  });

  /**
   * Confirmar o tipo de uma entrega — a resposta pro "quando cobrar cada tipo".
   *
   * A escolha fica na PEÇA (deliverables.tipo_cobranca), não no rascunho:
   * regerar o mês mantém o que já foi decidido. E o lugar de decidir é aqui,
   * na revisão do fechamento, não no meio da produção — o editor não tem que
   * pensar em preço enquanto edita.
   */
  const trocarTipo = useMutation({
    mutationFn: async ({ did, tipo }: { did: string; tipo: string }) => {
      const { data, error } = await (supabase as any)
        .from("deliverables").update({ tipo_cobranca: tipo || null }).eq("id", did).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("não deu pra gravar o tipo nesta peça");
      const { error: e2 } = await (supabase as any).rpc("gerar_faturamento_mensal", { _ref_mes: ref, _client: null, _apenas_auto: false });
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] }),
    onError: (e: any) => toast.error("Não trocou", { description: e.message }),
  });

  const mesAtualTemHora = (panorama?.meses || []).some(([m]) => m === ref.slice(0, 7));
  const outrosMeses = (panorama?.meses || []).filter(([m]) => m !== ref.slice(0, 7));

  const gerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("gerar_faturamento_mensal", { _ref_mes: ref, _client: null, _apenas_auto: false });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] });
      toast.success(`${n} faturamento(s) gerado(s)/atualizado(s).`);
    },
    onError: (e: any) => toast.error("Erro ao gerar: " + (e?.message || e)),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("faturamento_mensal").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] }),
  });

  // Rascunho → fatura: o balde do mês vira UMA fatura, emitida no mês seguinte.
  // No contrato, só o excedente da franquia (o fixo é faturado por fora).
  const faturar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("faturar_mes", { _id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Fatura gerada", { description: "Emitida com data do mês seguinte, em Faturamento." });
      qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error("Não faturou", { description: e.message }),
  });

  /**
   * Apagar um fechamento gerado por engano — mês errado, cliente que não era
   * pra entrar, teste.
   *
   * Fechamento que já virou fatura NÃO some (o banco recusa): apagar deixaria
   * a invoice órfã e o mês parecendo nunca fechado. Nesse caso o caminho é
   * cancelar a fatura primeiro, em Faturamento.
   *
   * O `.select()` não é enfeite: o PostgREST devolve 204 no DELETE mesmo
   * quando a RLS barra tudo — sem contar as linhas, um "apagado" apareceria
   * na tela sem nada ter sido apagado.
   */
  const apagar = useMutation({
    mutationFn: async (f: Fatura) => {
      const { data, error } = await (supabase as any)
        .from("faturamento_mensal").delete().eq("id", f.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nada foi apagado — você tem permissão pra mexer em dinheiro?");
    },
    onSuccess: () => {
      toast.success("Fechamento apagado");
      qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] });
    },
    onError: (e: any) => toast.error("Não apagou", { description: e.message }),
  });

  const pedirParaApagar = async (f: Fatura) => {
    const ok = await confirmar({
      title: `Apagar o fechamento de ${f.client?.name || "este cliente"}?`,
      description: (
        <>
          Some o rascunho de {mesLabel} ({formatCurrency(f.total)}).
          As horas apontadas não são tocadas — só este fechamento.
          {" "}Se o cliente continuar com modelo de cobrança na ficha, o próximo{" "}
          <b>Gerar / atualizar mês</b> cria de novo.
        </>
      ),
      confirmText: "Apagar",
      destructive: true,
    });
    if (ok) apagar.mutate(f);
  };

  const totalMes = faturas.reduce((s, f) => s + (f.total || 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Faturamento mensal</h1>
            <p className="text-sm text-muted-foreground">Rascunhos por cliente — gerados no dia 01, revisáveis antes de enviar.</p>
          </div>
        </div>
        <Button onClick={() => gerar.mutate()} disabled={gerar.isPending}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${gerar.isPending ? "animate-spin" : ""}`} />
          Gerar / atualizar mês
        </Button>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => setRef(() => { const [y, m] = ref.split("-").map(Number); return primeiroDiaISO(y, m - 1); })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold capitalize text-foreground">{mesLabel}</p>
          <p className="text-xs text-muted-foreground">{faturas.length} cliente(s) · total {formatCurrency(totalMes)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRef(() => { const [y, m] = ref.split("-").map(Number); return primeiroDiaISO(y, m + 1); })}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Mês exibido sem NENHUMA hora, mas existe hora noutro mês: diz onde
          está, em vez de mostrar R$ 0,00 e deixar parecendo defeito. */}
      {!mesAtualTemHora && outrosMeses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Nenhuma hora apontada em <span className="capitalize text-foreground">{mesLabel}</span>.
            {" "}As horas estão em:
          </span>
          {outrosMeses.slice(0, 3).map(([m, min]) => {
            const [y, mm] = m.split("-").map(Number);
            const rotulo = new Date(y, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
            return (
              <Button
                key={m}
                size="sm"
                variant="outline"
                className="h-7 text-xs capitalize"
                onClick={() => setRef(`${m}-01`)}
              >
                {rotulo} · {(min / 60).toFixed(1)}h
              </Button>
            );
          })}
        </div>
      )}

      {/* Hora de cliente sem modelo de cobrança não entra em rascunho nenhum
          — é dinheiro que evapora em silêncio. */}
      {(panorama?.semConfig?.length || 0) > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            Horas que não vão virar fatura
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Estes clientes têm hora apontada em <span className="capitalize">{mesLabel}</span> mas nenhum modelo de
            cobrança na ficha — não entram no rascunho:
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {panorama!.semConfig.map((c) => (
              <li key={c.nome} className="text-xs text-foreground">
                <span className="font-medium">{c.nome}</span>
                <span className="text-muted-foreground"> · {c.horas.toFixed(1)}h</span>
              </li>
            ))}
          </ul>
          <Link to="/clientes" className="mt-1.5 inline-block text-[11px] text-primary hover:underline">
            configurar na ficha do cliente →
          </Link>
        </div>
      )}

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : faturas.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nada gerado para {mesLabel}.</p>
            <Button variant="outline" size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Gerar agora
            </Button>
            <p className="text-[11px] text-muted-foreground">Só entram clientes com modelo de cobrança configurado na ficha.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {faturas.map((f) => {
            const st = STATUS[f.status] || STATUS.rascunho;
            const saude = f.detalhe?.saude;
            const dif = saude?.diferenca ?? null;
            const expandido = aberto === f.id;
            return (
              <Card key={f.id} className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  {/* Linha principal */}
                  <button
                    onClick={() => setAberto(expandido ? null : f.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/10"
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandido ? "" : "-rotate-90"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{f.client?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {MODELO_LABEL[f.modelo] || f.modelo}
                        {f.modelo === "horas" && ` · ${fmtHoras(f.horas_edicao + f.horas_alteracao)} × ${formatCurrency(f.valor_hora)}`}
                      </p>
                      {/* Saldo a usar na linha principal, não escondido no
                          detalhe: cobrar cheio de quem ainda tem crédito é
                          exatamente o erro que ele existe pra evitar. */}
                      {saldoDe(f.client_id) && (
                        <p className="mt-0.5 text-[11px] text-success">
                          tem a usar: {saldoDe(f.client_id)}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
                    <span className="w-28 text-right text-sm font-semibold text-primary">{formatCurrency(f.total)}</span>
                  </button>

                  {expandido && (
                    <div className="space-y-4 border-t border-border/40 px-4 py-4 text-sm">
                      {/* Composição do valor */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                        {f.modelo === "horas" && (
                          <>
                            <Kpi label="Horas edição" v={fmtHoras(f.horas_edicao)} />
                            <Kpi label="Horas alteração" v={fmtHoras(f.horas_alteracao)} />
                          </>
                        )}
                        <Kpi label="Subtotal" v={formatCurrency(f.subtotal)} />
                        <Kpi label={`Margem ${f.margem_percent}%`} v={formatCurrency(f.margem_valor)} />
                        {/* Comissão só aparece quando existe — cliente sem
                            comissão não precisa ver uma linha de R$ 0,00. */}
                        {Number((f as any).comissao_valor) > 0 && (
                          <Kpi
                            label={`Comissão${(f.detalhe?.comissoes || []).length === 1 ? ` · ${f.detalhe.comissoes[0].nome}` : ""}`}
                            v={formatCurrency((f as any).comissao_valor)}
                          />
                        )}
                        <Kpi label={`Imposto ${f.imposto_percent}%`} v={formatCurrency(f.imposto_valor)} />
                        <Kpi label="Total" v={formatCurrency(f.total)} destaque />
                      </div>

                      {/* Saúde (contrato/tabela × nosso valor-hora) */}
                      {saude && (
                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${dif >= 0 ? "border-emerald-500/30 bg-emerald-500/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
                          {dif >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          <span>
                            Cobrando <b>{formatCurrency(saude.valor_cobrado)}</b> · por horas ao nosso valor-tabela ({formatCurrency(saude.valor_hora_referencia)}/h × {fmtHoras(saude.horas_total)}) daria <b>{formatCurrency(saude.valor_equivalente_horas)}</b> → {dif >= 0 ? "acima" : "abaixo"} em <b>{formatCurrency(Math.abs(dif))}</b>
                          </span>
                        </div>
                      )}

                      {/* Consumo de contrato */}
                      {f.detalhe?.consumo && (
                        <Bloco icon={<FileText className="h-3.5 w-3.5" />} titulo={`Consumo — ${f.detalhe.consumo.contrato}`}>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Kpi label="Diárias no mês" v={`${f.detalhe.consumo.diarias_usadas_mes}/${f.detalhe.consumo.diarias_franquia_mes}`} />
                            <Kpi label={`Saldo diárias (${f.detalhe.consumo.acumulo_meses}m)`} v={String(f.detalhe.consumo.diarias_saldo_janela)} />
                            <Kpi label="Entregas no mês" v={`${f.detalhe.consumo.entregas_usadas_mes}/${f.detalhe.consumo.entregas_franquia_mes}`} />
                            <Kpi label={`Saldo entregas (${f.detalhe.consumo.acumulo_meses}m)`} v={String(f.detalhe.consumo.entregas_saldo_janela)} />
                          </div>
                        </Bloco>
                      )}

                      {/* Itens da tabela */}
                      {Array.isArray(f.detalhe?.itens) && f.detalhe.itens.length > 0 && (
                        <Bloco icon={<Receipt className="h-3.5 w-3.5" />} titulo={`Entregas do mês (${f.detalhe.itens.length})`}>
                          <div className="space-y-1">
                            {f.detalhe.itens.map((it: any, i: number) => {
                              const lista = (precos as any)[f.client_id] || [];
                              // Estourou a faixa: consumiu mais horas do que o
                              // tipo prevê. É o sinal de que o preço ficou
                              // barato pro trabalho que deu.
                              const estourou = it.horas_ref && Number(it.horas) > Number(it.horas_ref);
                              return (
                                <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{it.entregavel}</span>
                                  {Number(it.horas) > 0 && (
                                    <span className={`shrink-0 tabular-nums ${estourou ? "font-semibold text-warning" : "text-muted-foreground"}`}
                                      title={it.horas_ref ? `a tabela prevê ${it.horas_ref}h para "${it.tipo}"` : "horas apontadas nesta peça"}>
                                      {fmtHoras(Number(it.horas))}{it.horas_ref ? ` / ${fmtHoras(Number(it.horas_ref))}` : ""}
                                    </span>
                                  )}
                                  {lista.length > 0 && it.deliverable_id ? (
                                    <select
                                      value={it.origem === "nao_cobrar" ? "nao_cobrar" : (it.tipo || "")}
                                      disabled={trocarTipo.isPending}
                                      onChange={(e) => trocarTipo.mutate({ did: it.deliverable_id, tipo: e.target.value })}
                                      className={`h-6 shrink-0 rounded border bg-transparent px-1 text-[11px] ${
                                        it.origem === "nao_cobrar" ? "border-border/40 text-muted-foreground/60 line-through"
                                        : it.origem === "escolhido" ? "border-primary/50 text-foreground"
                                        : "border-border/50 text-muted-foreground"
                                      }`}
                                      title={
                                        it.origem === "nao_cobrar" ? "não entra na conta — o cliente vê a entrega, sem preço"
                                        : it.origem === "escolhido" ? "tipo confirmado por você"
                                        : it.origem === "horas" ? "sugerido pelas horas da peça — confirme se estiver certo"
                                        : it.origem === "nome" ? "veio do nome da peça"
                                        : "nenhum tipo casou"
                                      }
                                    >
                                      <option value="">— sem tipo —</option>
                                      {lista.map((t: any) => (
                                        <option key={t.tipo} value={t.tipo}>{t.tipo}</option>
                                      ))}
                                      {/* Sete entregas, uma cobrança: o corte
                                          de podcast já está pago dentro do
                                          principal. Continua no relatório. */}
                                      <option value="nao_cobrar">não cobrar (incluso)</option>
                                    </select>
                                  ) : (
                                    <span className="shrink-0 text-warning">sem preço</span>
                                  )}
                                  <span className="w-20 shrink-0 text-right text-foreground">{formatCurrency(it.preco || 0)}</span>
                                </div>
                              );
                            })}
                          </div>
                          <details className="pt-1">
                            <summary className="cursor-pointer list-none text-[10px] text-muted-foreground hover:text-foreground">
                              ⌄ como decidir o tipo de cada entrega
                            </summary>
                            <ol className="mt-1 space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                              <li className="list-decimal">A Adverse foi a campo? → <b>Captação</b></li>
                              <li className="list-decimal">Furou a fila por urgência? → <b>Edição urgente</b></li>
                              <li className="list-decimal">É recorte/versão de material já editado (story, corte, vertical)? → <b>não cobrar</b>, se já está pago na peça de origem</li>
                              <li className="list-decimal">Vídeo longo, com decupagem e motion? → <b>Vídeo principal</b></li>
                              <li className="list-decimal">Tem decupagem, transições e letterings? → <b>Pílula +</b></li>
                              <li className="list-decimal">Resto (legenda, trilha, cortes, lettering básico) → <b>Pílula</b></li>
                            </ol>
                            <p className="mt-1 pl-4 text-[10px] text-muted-foreground">
                              A ordem importa: pare na primeira que responder "sim". Borda acesa = confirmado
                              por você; as outras vieram do nome ou das horas. Horas em âmbar passaram do
                              previsto pelo tipo — é sinal de que o preço ficou barato pro trabalho que deu.
                            </p>
                          </details>
                        </Bloco>
                      )}

                      {/* Horas por projeto */}
                      {Array.isArray(f.detalhe?.por_projeto) && f.detalhe.por_projeto.length > 0 && (
                        <Bloco icon={<Clock className="h-3.5 w-3.5" />} titulo="Horas por projeto">
                          <div className="space-y-1">
                            {f.detalhe.por_projeto.map((p: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="truncate text-muted-foreground">{p.projeto}</span>
                                <span className="text-foreground">{fmtHoras(p.horas)} <span className="text-muted-foreground">(ed {fmtHoras(p.horas_edicao)} · alt {fmtHoras(p.horas_alteracao)})</span></span>
                              </div>
                            ))}
                          </div>
                        </Bloco>
                      )}

                      {/* Avulsos: NÃO entram no total acima. Ficam em destaque
                          porque é justamente o que se esquece de cobrar. */}
                      {Array.isArray(f.detalhe?.avulsos) && f.detalhe.avulsos.length > 0 && (
                        <Bloco
                          icon={<AlertTriangle className="h-3.5 w-3.5" />}
                          titulo={`Fora do fechamento — faturar à parte (${f.detalhe.avulsos.length})`}
                        >
                          <div className="space-y-1 rounded-md border border-amber-500/25 bg-amber-500/[0.06] p-2">
                            <p className="text-[11px] text-warning">
                              Estes projetos NÃO estão somados no total deste rascunho.
                            </p>
                            {f.detalhe.avulsos.map((a: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate text-muted-foreground">
                                  {a.numero ? `${a.numero} · ` : ""}{a.projeto}
                                </span>
                                <span className="shrink-0 text-foreground">
                                  {fmtHoras(a.horas)}
                                  {a.entregas > 0 && (
                                    <span className="text-muted-foreground"> · {a.entregas} entrega{a.entregas > 1 ? "s" : ""}</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </Bloco>
                      )}

                      {/* Demandas do mês (quem pediu) */}
                      {Array.isArray(f.detalhe?.demandas) && f.detalhe.demandas.length > 0 && (
                        <Bloco icon={<Users className="h-3.5 w-3.5" />} titulo={`Demandas do mês (${f.detalhe.demandas.length})`}>
                          <div className="space-y-1">
                            {f.detalhe.demandas.map((d: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="truncate text-muted-foreground">{d.projeto} · <b className="text-foreground">{d.solicitante}</b></span>
                                <span className="text-muted-foreground">{d.n_entregas} entrega(s)</span>
                              </div>
                            ))}
                          </div>
                        </Bloco>
                      )}

                      {/* Alterações do mês (quem pediu) */}
                      {Array.isArray(f.detalhe?.alteracoes) && f.detalhe.alteracoes.length > 0 && (
                        <Bloco icon={<MessageSquareWarning className="h-3.5 w-3.5" />} titulo={`Alterações do mês (${f.detalhe.n_alteracoes})`}>
                          <div className="space-y-1">
                            {f.detalhe.alteracoes.map((a: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="truncate text-muted-foreground">{a.entregavel} — {a.titulo}</span>
                                <span className="text-foreground">{a.quem || "—"}</span>
                              </div>
                            ))}
                          </div>
                        </Bloco>
                      )}

                      {/* Ações de status */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {st.next && (
                          <Button size="sm" variant="outline" onClick={() => mudarStatus.mutate({ id: f.id, status: st.next! })}>
                            {st.nextLabel}
                          </Button>
                        )}
                        {f.status !== "rascunho" && (
                          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => mudarStatus.mutate({ id: f.id, status: "rascunho" })}>
                            Voltar a rascunho
                          </Button>
                        )}

                        {/* O balde do mês vira UMA fatura. No contrato, só o
                            excedente da franquia (o fixo é faturado por fora). */}
                        {(f as any).invoice_id ? (
                          <Link to="/faturamento">
                            <Button size="sm" variant="ghost" className="text-success">
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Faturado — ver fatura
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-primary text-primary-foreground"
                            disabled={faturar.isPending}
                            onClick={() => faturar.mutate(f.id)}
                          >
                            <Wallet className="mr-1.5 h-3.5 w-3.5" />
                            {f.modelo === "contrato" ? "Faturar excedente" : "Gerar fatura"}
                          </Button>
                        )}

                        {/* Gerado por engano (mês errado, cliente que não era
                            pra entrar). Só enquanto não virou fatura. */}
                        {!(f as any).invoice_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            disabled={apagar.isPending}
                            onClick={() => void pedirParaApagar(f)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Apagar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, v, destaque }: { label: string; v: string; destaque?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm ${destaque ? "font-bold text-primary" : "font-medium text-foreground"}`}>{v}</p>
    </div>
  );
}

function Bloco({ icon, titulo, children }: { icon: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{icon} {titulo}</p>
      {children}
    </div>
  );
}
