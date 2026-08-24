import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFiltro } from "@/hooks/useFiltro";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { BALDES, rotuloCurto } from "@/lib/faturamentoBalde";
import { CustosLinhas, type ItemCusto } from "@/components/producao/CustosLinhas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, TrendingUp, TrendingDown,
  Clock, FileText, MessageSquareWarning, Users, AlertTriangle, Wallet, CheckCircle2, Info, Trash2, CalendarClock, Link2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useConfirm } from "@/components/ui/confirm";
import { mesISO, primeiroDiaISO } from "@/lib/dataLocal";
import { useFormAutosave } from "@/hooks/useFormAutosave";

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
/**
 * O que o cliente paga por este mês: as DUAS notas somadas.
 *
 * `faturamento_mensal.total` é o total de UMA nota — a do fechamento. Quando
 * parte do mês sai em nota separada, ela é outro documento do MESMO período,
 * e quem olha a linha do cliente quer saber quanto o mês deu, não quanto deu
 * um dos dois papéis.
 *
 * O avulso NÃO entra: é outro projeto, cobrado por outra régua e muitas vezes
 * em outro mês. Ele tem bloco e total próprios, com o aviso de que está fora.
 */
function totalDoMes(f: any): number {
  return Number(f.total || 0) + Number(f.detalhe?.nota_mes?.total || 0);
}

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

/**
 * O projeto nasceu antes do mês que está sendo fechado?
 *
 * Compara ANO+MÊS, não a data crua: projeto de 30/06 e fechamento de julho são
 * meses diferentes mesmo separados por um dia. `ref_mes` vem do banco como
 * 'YYYY-MM-DD' — fatiar a string evita o fuso transformar 2026-07-01 em 30/06.
 */
function mesAnterior(criacao?: string | null, refMes?: string | null): boolean {
  if (!criacao || !refMes) return false;
  const d = new Date(criacao);
  if (Number.isNaN(d.getTime())) return false;
  const [ano, mes] = refMes.slice(0, 7).split("-").map(Number);
  return d.getFullYear() * 12 + d.getMonth() < ano * 12 + (mes - 1);
}

export default function FaturamentoMensal() {
  const qc = useQueryClient();
  const confirmar = useConfirm();
  // padrão: mês anterior (é o que o dia 01 fatura)
  const [ref, setRef] = useFiltro("mes", mesISO(-1), "faturamento");
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
    mutationFn: async ({ did, tipo, percent }: { did: string; tipo?: string; percent?: number }) => {
      const patch: Record<string, unknown> = {};
      if (tipo !== undefined) patch.tipo_cobranca = tipo || null;
      if (percent !== undefined) patch.cobranca_percent = percent;
      const { data, error } = await (supabase as any)
        .from("deliverables").update(patch).eq("id", did).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("não deu pra gravar o tipo nesta peça");
      const { error: e2 } = await (supabase as any).rpc("gerar_faturamento_mensal", { _ref_mes: ref, _client: null, _apenas_auto: false });
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] }),
    onError: (e: any) => toast.error("Não trocou", { description: e.message }),
  });

  /**
   * Mudar o balde de um projeto (ou de uma peça) e o valor combinado — daqui,
   * sem abrir o job.
   *
   * Era o pedido: "um botão simples pra clicar em faturar separado, seria
   * mais fácil que dentro da tarefa/projeto". Decidir dentro de cada job é
   * como o Sul Minas ficou com dois projetos marcados como nota separada e
   * as peças deles fixadas em 'mensal' — a nota saiu zero e não havia tela
   * onde isso aparecesse.
   *
   * Toda mutação regera o rascunho na sequência: número na tela que não
   * acompanha o clique é número em que ninguém confia.
   */
  const regerar = async () => {
    const { error } = await (supabase as any).rpc("gerar_faturamento_mensal", {
      _ref_mes: ref, _client: null, _apenas_auto: false,
    });
    if (error) throw error;
  };

  const mudarProjeto = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await (supabase as any)
        .from("projects").update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("sem permissão para alterar este projeto");
      await regerar();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] }),
    onError: (e: any) => toast.error("Não mudou", { description: e.message }),
  });

  const mudarPeca = useMutation({
    mutationFn: async ({ did, balde }: { did: string; balde: string | null }) => {
      const { data, error } = await (supabase as any)
        .from("deliverables").update({ faturamento: balde }).eq("id", did).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("sem permissão para alterar esta peça");
      await regerar();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] }),
    onError: (e: any) => toast.error("Não mudou", { description: e.message }),
  });

  /**
   * Lançar o custo do dia sem sair do fechamento.
   *
   * Grava na PRIMEIRA saída do dia (`saida_ids[0]`): quando dois projetos do
   * mesmo cliente gravaram junto, o custo é do dia, não de cada projeto —
   * lançar nos dois viraria repasse dobrado, que é o erro que a marca de "dia
   * compartilhado" existe pra evitar.
   */
  const [custoRascunho, setCustoRascunho] = useState<Record<string, ItemCusto[]>>({});
  const lancarCusto = useFormAutosave<{ saidaId: string; itens: ItemCusto[] }>(
    async ({ saidaId, itens }) => {
      // Grava só as linhas: o trigger no banco refaz custo_logistica/
      // alimentacao/hospedagem a partir delas. Mandar o total junto abriria
      // espaço pros dois divergirem.
      const { data, error } = await (supabase as any)
        .from("producao_saidas")
        .update({ custos_itens: itens.filter((i) => i.descricao.trim() || i.valor) })
        .eq("id", saidaId).select("id");
      if (error) { toast.error("Não lançou", { description: error.message }); throw error; }
      if (!data?.length) { toast.error("Não lançou — sem permissão nesta diária?"); throw new Error("rls"); }
      const { error: e2 } = await (supabase as any).rpc("gerar_faturamento_mensal", { _ref_mes: ref, _client: null, _apenas_auto: false });
      if (e2) { toast.error("Gravou o custo, mas não recalculou", { description: e2.message }); throw e2; }
      qc.invalidateQueries({ queryKey: ["faturamento_mensal", ref] });
    },
  );

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

  // O total da página soma as DUAS notas de cada cliente, como o card. Somar
  // só `f.total` faria o topo da tela discordar da soma dos cards abaixo dele.
  const totalMes = faturas.reduce((s, f) => s + totalDoMes(f), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Faturamento mensal</h1>
            <p className="text-sm text-muted-foreground">
              Rascunhos por cliente — gerados no dia 01, revisáveis antes de enviar.
            </p>
            {/* O critério do mês precisa estar escrito: ele muda o valor, e a
                consequência (o mês crescer depois) surpreende quem já mandou. */}
            <p className="mt-1 text-xs text-muted-foreground/80">
              O mês é cortado pela <strong className="text-foreground">data de criação</strong> do job —
              a mesma de <em>Entregas do mês</em>. Hora lançada depois, num job deste mês,
              entra aqui: <strong className="text-foreground">regere antes de faturar</strong>.
            </p>
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
                    {/* Avulso fora do fechamento fica visível com o card
                        FECHADO: é o dinheiro que escapa se ninguém abrir o
                        cliente, e era justamente o que exigia abrir todos pra
                        descobrir onde estava. */}
                    {Number(f.detalhe?.avulsos?.length || 0) > 0 && (
                      <Badge variant="outline" className="shrink-0 border-amber-500/40 text-[10px] text-amber-600">
                        {f.detalhe.avulsos.length} à parte
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
                    <span className="w-28 shrink-0 text-right">
                      <span className="block text-sm font-semibold text-primary">{formatCurrency(totalDoMes(f))}</span>
                      {Number(f.detalhe?.nota_mes?.total || 0) > 0 && (
                        <span className="block text-[10px] text-muted-foreground">em 2 notas</span>
                      )}
                    </span>
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
                        {/* Valor combinado (orçamento) entra DEPOIS do imposto:
                            é preço final, e sem esta linha ele apareceria só
                            dentro do total, como se a conta não fechasse. */}
                        {Number(f.detalhe?.valor_combinado || 0) > 0 && (
                          <Kpi
                            label="Valor combinado"
                            v={formatCurrency(Number(f.detalhe.valor_combinado))}
                          />
                        )}
                        {Number(f.detalhe?.saldo?.usado || 0) > 0 && (
                          <Kpi label="Saldo abatido" v={`− ${formatCurrency(Number(f.detalhe.saldo.usado))}`} />
                        )}
                        <Kpi
                          label={Number(f.detalhe?.nota_mes?.total || 0) > 0 ? "Total desta nota" : "Total"}
                          v={formatCurrency(f.total)}
                          destaque
                        />
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
                                      value={it.tipo || ""}
                                      disabled={trocarTipo.isPending}
                                      onChange={(e) => trocarTipo.mutate({ did: it.deliverable_id, tipo: e.target.value })}
                                      className={`h-6 shrink-0 rounded border bg-transparent px-1 text-[11px] ${
                                        it.origem === "escolhido" ? "border-primary/50 text-foreground" : "border-border/50 text-muted-foreground"
                                      }`}
                                      title={
                                        it.origem === "escolhido" ? "tipo confirmado por você"
                                        : it.origem === "horas" ? "sugerido pelas horas da peça — confirme se estiver certo"
                                        : it.origem === "nome" ? "veio do nome da peça"
                                        : "nenhum tipo casou"
                                      }
                                    >
                                      <option value="">— sem tipo —</option>
                                      {lista.map((t: any) => (
                                        <option key={t.tipo} value={t.tipo}>{t.tipo}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="shrink-0 text-warning">sem preço</span>
                                  )}
                                  {/* Quanto do tipo se cobra. Recorte de algo
                                      já editado teve trabalho — meia, não zero. */}
                                  {it.deliverable_id && (
                                    <select
                                      value={String(Number(it.percent ?? 100))}
                                      disabled={trocarTipo.isPending}
                                      onChange={(e) => trocarTipo.mutate({ did: it.deliverable_id, percent: Number(e.target.value) })}
                                      title="quanto do preço do tipo se cobra nesta entrega"
                                      className={`h-6 w-16 shrink-0 rounded border bg-transparent px-1 text-[11px] ${
                                        Number(it.percent ?? 100) === 100 ? "border-border/50 text-muted-foreground"
                                        : Number(it.percent) === 0 ? "border-border/40 text-muted-foreground/60"
                                        : "border-warning/50 text-warning"
                                      }`}
                                    >
                                      <option value="100">cheia</option>
                                      <option value="50">meia</option>
                                      <option value="0">cortesia</option>
                                    </select>
                                  )}
                                  <span className={`w-20 shrink-0 text-right ${Number(it.percent ?? 100) === 100 ? "text-foreground" : "text-warning"}`}>
                                    {formatCurrency(it.preco || 0)}
                                  </span>
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
                              <li className="list-decimal">É recorte/versão de material já editado (story, corte, vertical)? → o tipo da peça de origem, <b>meia</b> — teve trabalho, só não o trabalho inteiro</li>
                              <li className="list-decimal">Vídeo longo, com decupagem e motion? → <b>Vídeo principal</b></li>
                              <li className="list-decimal">Tem decupagem, transições e letterings? → <b>Pílula +</b></li>
                              <li className="list-decimal">Resto (legenda, trilha, cortes, lettering básico) → <b>Pílula</b></li>
                            </ol>
                            <p className="mt-1 pl-4 text-[10px] text-muted-foreground">
                              A ordem importa: pare na primeira que responder "sim". Borda acesa = confirmado
                              por você; as outras vieram do nome ou das horas. Horas em âmbar passaram do
                              previsto pelo tipo — sinal de que o preço ficou barato pro trabalho que deu.
                              A segunda caixa é quanto se cobra: <b>cheia</b>, <b>meia</b> (metade do preço do tipo)
                              ou <b>cortesia</b>.
                            </p>
                          </details>
                        </Bloco>
                      )}

                      {/* Diárias de gravação — bloco próprio, ao lado das
                          entregas. O repasse (custo × margem própria ×
                          imposto quando cabe) JÁ está somado no subtotal;
                          aqui é a memória de cálculo, que é o que se olha
                          quando o cliente pergunta de onde veio o número. */}
                      {Array.isArray(f.detalhe?.diarias) && f.detalhe.diarias.length > 0 && (
                        <Bloco
                          icon={<CalendarClock className="h-3.5 w-3.5" />}
                          titulo={`Diárias de gravação (${qtd(f.detalhe.diarias.reduce((s: number, d: any) => s + Number(d.fracao || 0), 0))})`}
                        >
                          <div className="space-y-1">
                            {f.detalhe.diarias.map((d: any, i: number) => (
                              <div key={i} className="space-y-1.5 rounded-md border border-border/40 p-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="shrink-0 font-medium tabular-nums text-foreground">
                                    {d.data?.slice(8, 10)}/{d.data?.slice(5, 7)}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {Number(d.fracao) < 1 ? "meia diária" : "diária cheia"}
                                  </span>
                                  {d.projetos > 1 && (
                                    <span className="inline-flex shrink-0 items-center gap-1 text-warning"
                                      title="mais de um projeto deste cliente gravou neste dia — conta como uma diária só">
                                      <Link2 className="h-3 w-3" /> {d.projetos} projetos
                                    </span>
                                  )}
                                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                                    {Number(d.repasse) > 0 ? `custos ${formatCurrency(Number(d.repasse))}` : "sem custos"}
                                  </span>
                                </div>
                                {/* Lançar aqui mesmo: quem fecha o mês é quem
                                    tem as notas na mão, e sair pro projeto pra
                                    voltar é atrito puro. */}
                                {d.saida_ids?.length ? (
                                  <CustosLinhas
                                    compacto
                                    itens={custoRascunho[d.data] ?? (d.custos_itens || [])}
                                    onChange={(novas) => {
                                      setCustoRascunho((r) => ({ ...r, [d.data]: novas }));
                                      lancarCusto.agendar({ saidaId: d.saida_ids[0], itens: novas });
                                    }}
                                  />
                                ) : (
                                  <p className="text-[11px] text-muted-foreground">
                                    Regere o mês pra liberar o lançamento de custos deste dia.
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Duas parcelas, porque são duas coisas: o DIA é
                              serviço, os custos do dia são repasse. */}
                          <div className="space-y-0.5 border-t border-border/40 pt-1.5 text-[11px]">
                            {Number(f.detalhe?.diarias_valor_unitario || 0) > 0 ? (
                              <p className="flex justify-between text-muted-foreground">
                                <span>
                                  {qtd(Number(f.detalhe.diarias_cobradas || 0))} × {formatCurrency(Number(f.detalhe.diarias_valor_unitario))} de diária
                                  {Number(f.detalhe?.diarias_saldo_abatido || 0) > 0 && (
                                    <span className="text-success"> · {qtd(Number(f.detalhe.diarias_saldo_abatido))} abatida do saldo</span>
                                  )}
                                </span>
                                <b className="text-foreground">{formatCurrency(Number(f.detalhe.diarias_valor || 0))}</b>
                              </p>
                            ) : (
                              <p className="text-warning">
                                Nenhuma linha da tabela está marcada como diária — o dia está saindo de graça.
                                Marque na ficha do cliente, em Faturamento.
                              </p>
                            )}
                            {Number(f.detalhe?.diarias_repasse || 0) > 0 && (
                              <p className="flex justify-between text-muted-foreground">
                                <span>custos de campo com margem de repasse</span>
                                <b className="text-foreground">{formatCurrency(Number(f.detalhe.diarias_repasse))}</b>
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground/70">Tudo isto já está somado no subtotal.</p>
                          </div>
                        </Bloco>
                      )}

                      {/* Horas por projeto */}
                      {Array.isArray(f.detalhe?.por_projeto) && f.detalhe.por_projeto.length > 0 && (
                        <Bloco icon={<Clock className="h-3.5 w-3.5" />} titulo={`Jobs do mês (${f.detalhe.por_projeto.length}) — onde se decide a nota`} aberto>
                          <div className="space-y-2">
                            {f.detalhe.por_projeto.map((p: any, i: number) => (
                              <LinhaJob
                                key={p.project_id || i}
                                p={p}
                                modelo={f.detalhe?.modelo}
                                refMes={f.ref_mes}
                                ocupado={mudarProjeto.isPending || mudarPeca.isPending}
                                onBalde={(balde) => mudarProjeto.mutate({ id: p.project_id, patch: { faturamento: balde } })}
                                onValor={(valor, origem) =>
                                  mudarProjeto.mutate({
                                    id: p.project_id,
                                    patch: { valor_fechamento: valor, valor_fechamento_origem: valor == null ? null : origem },
                                  })
                                }
                                onBaldePeca={(did, balde) => mudarPeca.mutate({ did, balde })}
                              />
                            ))}
                          </div>
                        </Bloco>
                      )}

                      {/* A nota separada DENTRO do mês: mesmo preço do
                          fechamento, documento próprio. Fica logo acima do
                          bloco dos avulsos porque as duas respondem "o que
                          mais eu tenho pra emitir?" — mas por réguas de preço
                          diferentes, e a tela diz qual é qual. */}
                      {Number(f.detalhe?.nota_mes?.total || 0) > 0 && (
                        <Bloco
                          icon={<FileText className="h-3.5 w-3.5" />}
                          titulo="No mês, em nota separada"
                        >
                          <div className="space-y-2 rounded-md border border-primary/25 bg-primary/[0.05] p-2">
                            <p className="text-[11px] text-muted-foreground">
                              Preço do mês, nota própria. <b className="text-foreground">Não</b> está somado no total
                              deste rascunho.
                            </p>

                            {(f.detalhe.nota_mes.projetos || []).map((pr: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                <span className="min-w-0 truncate">
                                  {pr.numero ? <span className="text-muted-foreground">{pr.numero} · </span> : ""}
                                  {pr.projeto}
                                  {pr.projeto_todo === false && (
                                    <span className="ml-1 text-[10px] text-muted-foreground">(só algumas peças)</span>
                                  )}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {pr.entregas > 0 && `${pr.entregas} entrega${pr.entregas > 1 ? "s" : ""}`}
                                  {Number(pr.horas || 0) > 0 && ` · ${fmtHoras(pr.horas)}`}
                                </span>
                              </div>
                            ))}

                            {(f.detalhe.nota_mes.itens || []).map((it: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 pl-3 text-[10px] text-muted-foreground">
                                <span className="min-w-0 truncate">{it.entregavel}</span>
                                <span className="shrink-0 tabular-nums">{formatCurrency(Number(it.preco || 0))}</span>
                              </div>
                            ))}

                            {/* Subtotal, margem e imposto abertos: é a mesma
                                conta do fechamento, e mostrar só o total faria
                                o número parecer tirado do nada na hora de
                                conferir com o contador. */}
                            <div className="space-y-0.5 border-t border-primary/25 pt-1.5 text-xs">
                              <Linha rot="Subtotal" v={formatCurrency(Number(f.detalhe.nota_mes.subtotal || 0))} />
                              {Number(f.detalhe.nota_mes.margem || 0) > 0 && (
                                <Linha rot="Margem" v={formatCurrency(Number(f.detalhe.nota_mes.margem))} />
                              )}
                              {Number(f.detalhe.nota_mes.imposto || 0) > 0 && (
                                <Linha rot="Imposto" v={formatCurrency(Number(f.detalhe.nota_mes.imposto))} />
                              )}
                              <div className="flex items-center justify-between gap-2 pt-0.5">
                                <span className="font-medium text-foreground">Total desta nota</span>
                                <b className="tabular-nums text-primary">
                                  {formatCurrency(Number(f.detalhe.nota_mes.total || 0))}
                                </b>
                              </div>
                            </div>

                            {f.detalhe.nota_mes.regra && (
                              <p className="text-[10px] text-muted-foreground">
                                Calculado por {f.detalhe.nota_mes.regra}
                                {Number(f.detalhe.nota_mes.horas_alteracao || 0) > 0 &&
                                  ` · ${fmtHoras(f.detalhe.nota_mes.horas_edicao)} edição + ${fmtHoras(f.detalhe.nota_mes.horas_alteracao)} alteração`}
                                .
                              </p>
                            )}
                          </div>
                        </Bloco>
                      )}

                      {/* Nota separada: NÃO entra no total acima. Fica em
                          destaque porque é justamente o que se esquece de
                          cobrar — e agora com VALOR, que era o que faltava
                          pra emitir a nota sem refazer a conta à mão. */}
                      {Array.isArray(f.detalhe?.avulsos) && f.detalhe.avulsos.length > 0 && (
                        <Bloco
                          icon={<AlertTriangle className="h-3.5 w-3.5" />}
                          titulo={`Fora do fechamento — faturar à parte (${f.detalhe.avulsos.length})`}
                          aberto
                        >
                          <div className="space-y-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] p-2">
                            <p className="text-[11px] text-warning">
                              Nada disto está somado no total deste rascunho.
                            </p>
                            {f.detalhe.avulsos.map((a: any, i: number) => (
                              <div key={i} className="space-y-0.5">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="min-w-0 truncate">
                                    {a.numero ? <span className="text-muted-foreground">{a.numero} · </span> : ""}
                                    {a.projeto}
                                    {a.projeto_todo === false && (
                                      <span className="ml-1 text-[10px] text-muted-foreground">(só algumas peças)</span>
                                    )}
                                  </span>
                                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                                    {formatCurrency(Number(a.valor || 0))}
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  {fmtHoras(a.horas)}
                                  {Number(a.horas_alteracao || 0) > 0 &&
                                    ` (${fmtHoras(a.horas_edicao)} edição + ${fmtHoras(a.horas_alteracao)} alteração)`}
                                  {a.entregas > 0 && ` · ${a.entregas} entrega${a.entregas > 1 ? "s" : ""}`}
                                </p>
                                {/* As peças só quando a separação foi feita
                                    peça a peça: no projeto inteiro avulso a
                                    lista seria só o conteúdo do job, e o link
                                    do projeto já leva lá. */}
                                {a.projeto_todo === false && Array.isArray(a.pecas) && a.pecas.map((pc: any, j: number) => (
                                  <div key={j} className="flex items-center justify-between gap-2 pl-3 text-[10px] text-muted-foreground">
                                    <span className="min-w-0 truncate">{pc.codigo ? `${pc.codigo} · ` : ""}{pc.entregavel}</span>
                                    <span className="shrink-0 tabular-nums">{fmtHoras(pc.horas)}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                            <div className="flex items-center justify-between gap-2 border-t border-amber-500/25 pt-1.5 text-xs">
                              <span className="text-muted-foreground">Total a faturar à parte</span>
                              <b className="tabular-nums text-warning">
                                {formatCurrency(Number(f.detalhe?.avulsos_valor || 0))}
                              </b>
                            </div>
                            {/* Qual régua pariu esses valores. Sem isto, um
                                cliente que paga por tabela veria um total em
                                reais sem jeito de saber que ele saiu do nosso
                                valor-hora interno, e não do combinado com
                                ele. Nota errada nasce assim. */}
                            <p className="text-[10px] text-muted-foreground">
                              {f.detalhe?.avulsos_valor_hora_origem === "cliente"
                                ? `Horas × ${formatCurrency(Number(f.detalhe?.avulsos_valor_hora || 0))} — valor-hora deste cliente.`
                                : f.detalhe?.avulsos_valor_hora_origem === "rate_card"
                                  ? `Horas × ${formatCurrency(Number(f.detalhe?.avulsos_valor_hora || 0))} — nosso valor de tabela (Edição). Este cliente não tem valor-hora combinado; confira antes de emitir.`
                                  : "Sem valor-hora cadastrado nem no cliente nem no rate card — o valor sai zerado."}
                            </p>
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

                      {/* RODAPÉ: o mês fechado, com as notas separadas.
                          Os blocos acima detalham cada documento; aqui é a
                          única linha que responde "quanto o cliente paga por
                          este mês" — que é a pergunta de quem vai emitir, e
                          estava espalhada em dois totais que ninguém somava
                          na tela. */}
                      {Number(f.detalhe?.nota_mes?.total || 0) > 0 && (
                        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Total de {mesLabel}
                          </p>
                          <Linha rot="Nota do fechamento" v={formatCurrency(f.total)} />
                          <Linha rot="Nota separada" v={formatCurrency(Number(f.detalhe.nota_mes.total))} />
                          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                            <span className="font-medium text-foreground">Total do mês · 2 notas</span>
                            <b className="tabular-nums text-primary">{formatCurrency(totalDoMes(f))}</b>
                          </div>
                          {/* O avulso fica de fora e a folha diz isso: é outro
                              projeto, por outra régua, às vezes de outro mês. */}
                          {Number(f.detalhe?.avulsos_valor || 0) > 0 && (
                            <p className="mt-1.5 text-[10px] text-muted-foreground">
                              Fora daqui: {formatCurrency(Number(f.detalhe.avulsos_valor))} a faturar à parte
                              (outros projetos — ver o bloco acima).
                            </p>
                          )}
                        </div>
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

                        {/* A carta que vai pro cliente: o mesmo fechamento,
                            escrito pra quem paga em vez de pra quem cobra. */}
                        <Link to={`/relatorio-cliente/${f.client_id}/${ref.slice(0, 7)}`}>
                          <Button size="sm" variant="outline">
                            <FileText className="mr-1.5 h-3.5 w-3.5" /> Relatório do cliente
                          </Button>
                        </Link>

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

/**
 * Uma linha por job do mês: o que ele deu, quanto vale, em qual nota entra.
 *
 * É o painel que faltava. As três decisões do fechamento — em qual nota o job
 * cai, quanto ele vale, e se alguma peça dele foge da regra do job — moravam
 * em três telas diferentes, cada uma dentro de um projeto. Quem fecha o mês
 * olha trinta jobs; abrir trinta fichas pra decidir é o trabalho que a tela
 * existia pra tirar.
 *
 * A lista de peças só abre quando ALGUMA peça diverge do balde do job. É o
 * caso raro, e é exatamente o que explica uma nota separada em zero — mostrar
 * as peças sempre esconderia esse sinal no meio do ruído.
 */
function LinhaJob({ p, modelo, refMes, ocupado, onBalde, onValor, onBaldePeca }: {
  p: any; modelo?: string; refMes?: string; ocupado: boolean;
  onBalde: (b: string) => void;
  onValor: (v: number | null, origem: "orcamento" | "manual") => void;
  onBaldePeca: (did: string, balde: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState("");
  const balde = String(p.balde || "mensal");
  const antigo = mesAnterior(p.criacao, refMes);
  const pecas: any[] = Array.isArray(p.pecas) ? p.pecas : [];
  const divergem = pecas.filter((pc) => String(pc.balde) !== balde);
  const orcamento = Number(p.orcamento_valor || 0);
  const combinado = p.valor_fechamento != null ? Number(p.valor_fechamento) : null;
  // No modelo horas o valor calculado é horas × valor-hora; no de tabela ele
  // sai da soma das peças e vive no bloco de entregas, então aqui a conta por
  // hora aparece como referência.
  const valorHoras = Number(p.valor_horas || 0);

  const confirmar = () => {
    const n = Number(txt.replace(/\./g, "").replace(",", "."));
    setEditando(false);
    if (!txt.trim()) return onValor(null, "manual");
    if (!Number.isFinite(n) || n < 0) return toast.error("Valor inválido");
    onValor(n, "manual");
  };

  return (
    <div className={`rounded-md border p-2 ${balde === "mensal" ? "border-border/40" : "border-warning/30 bg-warning/[0.04]"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate">
          {p.numero && <span className="text-muted-foreground">{p.numero} · </span>}
          {p.projeto}
          {p.criacao && (
            <span
              className={`ml-1.5 rounded px-1 py-0.5 text-[9px] ${antigo ? "bg-muted text-muted-foreground" : "text-muted-foreground/60"}`}
              title={antigo
                ? "Projeto de mês anterior aparecendo aqui não deveria mais acontecer — o corte agora é pela criação. Se aparecer, me avise."
                : "Data de criação do projeto"}
            >
              {new Date(p.criacao).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </span>
          )}
        </span>

        <span className="shrink-0 tabular-nums text-muted-foreground" title="horas apontadas no job neste mês">
          {fmtHoras(p.horas)}
        </span>

        {/* Em qual nota o job entra — um clique, sem abrir o job. */}
        <select
          value={balde}
          disabled={ocupado}
          onChange={(e) => onBalde(e.target.value)}
          className={`h-6 shrink-0 rounded border bg-transparent px-1 text-[11px] ${
            balde === "mensal" ? "border-border/50 text-muted-foreground" : "border-warning/50 text-warning"
          }`}
          title="em qual nota este job entra"
        >
          {BALDES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>

        {/* Valor combinado. Vazio = calcula pelo normal. */}
        {editando ? (
          <input
            autoFocus
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => { if (e.key === "Enter") confirmar(); if (e.key === "Escape") setEditando(false); }}
            placeholder="vazio = calcular"
            className="h-6 w-28 shrink-0 rounded border border-primary/50 bg-transparent px-1 text-right text-[11px]"
          />
        ) : (
          <button
            disabled={ocupado}
            onClick={() => { setTxt(combinado != null ? String(combinado).replace(".", ",") : ""); setEditando(true); }}
            title={combinado != null
              ? `valor combinado (${p.valor_origem === "orcamento" ? "do orçamento" : "digitado"}) — clique para editar`
              : "clique para combinar um valor fixo para este job"}
            className={`h-6 w-28 shrink-0 rounded border px-1 text-right tabular-nums text-[11px] ${
              combinado != null ? "border-primary/50 text-foreground" : "border-dashed border-border/50 text-muted-foreground"
            }`}
          >
            {combinado != null ? formatCurrency(combinado) : modelo === "horas" ? formatCurrency(valorHoras) : "combinar"}
          </button>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-[10px] text-muted-foreground">
        {combinado != null ? (
          <span>
            Vale <b className="text-foreground">{formatCurrency(combinado)}</b>{" "}
            {p.valor_origem === "orcamento" ? "pelo orçamento" : "por acordo"} — as horas deste job saem da conta por hora.
          </span>
        ) : modelo === "horas" ? (
          <span>{fmtHoras(p.horas)} × valor-hora = {formatCurrency(valorHoras)}</span>
        ) : (
          <span>Cobrado pelas peças (ver Entregas do mês)</span>
        )}

        {/* O atalho do pedido: job que já tem orçamento entra pelo valor
            vendido, porque foi trabalhado de forma individual. Não é
            automático — preço de cliente mudando por efeito colateral de
            outra ação é como se perde a confiança no número. */}
        {orcamento > 0 && combinado !== orcamento && (
          <button
            disabled={ocupado}
            onClick={() => onValor(orcamento, "orcamento")}
            className="rounded border border-primary/40 px-1.5 py-0.5 text-primary hover:bg-primary/10"
          >
            usar o orçamento{p.orcamento_numero ? ` #${String(p.orcamento_numero).padStart(4, "0")}` : ""} ({formatCurrency(orcamento)})
          </button>
        )}
        {combinado != null && (
          <button
            disabled={ocupado}
            onClick={() => onValor(null, "manual")}
            className="rounded border border-border/50 px-1.5 py-0.5 hover:text-foreground"
          >
            voltar ao cálculo
          </button>
        )}
      </div>

      {/* Peça que não segue o job. É o sinal que explicava a nota em zero. */}
      {divergem.length > 0 && (
        <div className="mt-1.5 space-y-1 rounded border border-destructive/30 bg-destructive/[0.05] p-1.5">
          <p className="text-[10px] text-destructive">
            {divergem.length} {divergem.length === 1 ? "peça está" : "peças estão"} em nota diferente da do job —
            a marcação da peça vence a do job.
          </p>
          {divergem.map((pc: any) => (
            <div key={pc.deliverable_id} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="min-w-0 truncate">{pc.entregavel}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-muted-foreground">{rotuloCurto(pc.balde)}</span>
                <button
                  disabled={ocupado}
                  onClick={() => onBaldePeca(pc.deliverable_id, null)}
                  className="rounded border border-border/50 px-1.5 py-0.5 hover:text-foreground"
                >
                  seguir o job
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rótulo à esquerda, número à direita — a linha de conta desta tela. */
function Linha({ rot, v }: { rot: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{rot}</span>
      <span className="tabular-nums text-foreground">{v}</span>
    </div>
  );
}

/**
 * Um bloco do detalhe do cliente — agora recolhível.
 *
 * Djêisson (23/08/2026): "o visual está péssimo, com muita informação na tela".
 * Eram OITO destes abertos ao mesmo tempo por cliente, cada um com a sua lista:
 * consumo, entregas, diárias, jobs, nota separada, fora do fechamento, demandas
 * e alterações. Com três clientes, vinte e quatro listas de uma vez.
 *
 * Nem todos pesam igual. Faturar é decidir em qual nota cada job entra — esse
 * bloco e o dos avulsos fora do fechamento abrem sozinhos, porque são onde a
 * decisão acontece e onde o dinheiro escapa. Os outros seis são conferência:
 * ficam a um clique, com a contagem no título, que é o que se olha na maior
 * parte das vezes.
 */
function Bloco({ icon, titulo, children, aberto = false }: {
  icon: React.ReactNode; titulo: string; children: React.ReactNode; aberto?: boolean;
}) {
  const [ver, setVer] = useState(aberto);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setVer(!ver)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${ver ? "" : "-rotate-90"}`} />
        {icon} {titulo}
      </button>
      {ver && children}
    </div>
  );
}
