import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Plus, MapPin, X, Loader2, Users, Link2, Trash2 } from "lucide-react";
import { CustosLinhas, somaCustos, type ItemCusto } from "./CustosLinhas";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTeamMembers } from "@/hooks/useTeamMembers";
import {
  useSalvarSaida, useCancelarSaida, useExcluirSaida, type SaidaProducao, type StatusSaida,
} from "@/hooks/useSaidasProducao";
import { hojeISO } from "@/lib/dataLocal";
import { toast } from "sonner";

/**
 * Diárias de gravação do projeto. As diárias vêm do orçamento como um SALDO
 * (diarias_contratadas) que a produção agenda em datas reais aqui. Cada diária
 * é uma producao_saidas (tipo='diaria'): aparece no Calendário e nas Saídas,
 * publica no Google Agenda e desconta a capacidade da semana da equipe escalada.
 */
export function DiariasProjeto({
  projectId, projectName, diariasContratadas = 0, clientId,
}: {
  projectId: string;
  projectName: string;
  diariasContratadas?: number;
  clientId?: string | null;
}) {
  const formId = useId();
  const confirmar = useConfirm();
  const { data: membros = [] } = useActiveTeamMembers();
  const salvar = useSalvarSaida();
  const cancelar = useCancelarSaida();
  const excluir = useExcluirSaida();

  const [abrindo, setAbrindo] = useState(false);
  const [data, setData] = useState("");
  const [status, setStatus] = useState<StatusSaida>("agendada");
  const [local, setLocal] = useState("");
  const [equipe, setEquipe] = useState<string[]>([]);
  const [fracao, setFracao] = useState(1);
  const [custos, setCustos] = useState<ItemCusto[]>([]);

  const { data: diarias = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto-diarias", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("producao_saidas")
        .select("*")
        .eq("project_id", projectId)
        .eq("tipo", "diaria")
        .order("data", { ascending: true });
      if (error) throw error;
      return data as SaidaProducao[];
    },
  });

  /**
   * Dias em que ESTE CLIENTE já tem diária — inclusive de outro projeto.
   * É o que permite dizer "esse dia já está agendado" antes de agendar, em
   * vez de o cliente descobrir na fatura que pagou duas vezes pela mesma
   * saída.
   */
  const { data: diasDoCliente = [] } = useQuery({
    queryKey: ["diarias-do-cliente", clientId],
    enabled: !!clientId,
    queryFn: async () =>
      (await (supabase as any).from("diarias_por_dia").select("*").eq("client_id", clientId)).data || [],
  });
  const diaCompartilhado = (iso: string) => {
    const d = (diasDoCliente as any[]).find((x) => x.data === iso);
    return d && d.projetos > 1 ? d : null;
  };

  const nomeMembro = useMemo(() => {
    const m = new Map(membros.map((x: any) => [x.id, x.name]));
    return (id: string) => m.get(id) || "—";
  }, [membros]);

  const agendadas = diarias.filter((d) => d.status !== "cancelada");
  const contratadas = diariasContratadas || 0;
  const total = agendadas.reduce((n, d) => n + Number(d.fracao ?? 1), 0);
  const realizadas = agendadas.filter(d => d.status === "realizada").reduce((n, d) => n + Number(d.fracao ?? 1), 0);
  const restam = Math.max(0, contratadas - total);
  const ocupado = salvar.isPending || cancelar.isPending || excluir.isPending;
  const numero = (n: number) => n.toLocaleString("pt-BR");

  const toggleMembro = (id: string) =>
    setEquipe((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const agendar = () => {
    if (!data) { toast.error("Escolha a data da diária"); return; }
    if (status === "realizada" && data > hojeISO()) { toast.error("Uma diária futura deve ficar como agendada"); return; }
    salvar.mutate(
      {
        tipo: "diaria",
        titulo: `Diária — ${projectName}`,
        project_id: projectId,
        data,
        dia_inteiro: fracao === 1,
        fracao,
        local: local.trim() || null,
        equipe,
        // As linhas mandam: o trigger no banco refaz os três totais a partir
        // delas. Mando os totais junto só pra tela não esperar o refetch.
        custos_itens: custos.filter((c) => c.descricao.trim() || c.valor),
        custo_logistica: somaCustos(custos.filter((c) => c.cat === "logistica")),
        custo_alimentacao: somaCustos(custos.filter((c) => c.cat === "alimentacao")),
        custo_hospedagem: somaCustos(custos.filter((c) => c.cat === "hospedagem")),
        status,
      },
      {
        onSuccess: () => {
          setData(""); setLocal(""); setEquipe([]); setAbrindo(false);
          setFracao(1); setCustos([]); setStatus("agendada");
          toast.success(status === "realizada" ? "Diária realizada registrada" : "Diária agendada");
        },
        onError: (e: any) => toast.error("Erro", { description: e.message }),
      },
    );
  };

  /**
   * Excluir some com a linha; cancelar mantém no histórico.
   *
   * Os dois existem porque são coisas diferentes: diária que CAIU faz parte
   * da história do projeto (o dia foi bloqueado, a equipe se organizou), e
   * diária lançada na data errada é só erro de digitação — não merece virar
   * registro.
   */
  const excluirDiaria = async (d: SaidaProducao) => {
    if (!(await confirmar({
      title: "Excluir esta diária?",
      description: `${fmtData(d.data)}${d.local ? ` · ${d.local}` : ""} — some de vez, inclusive do Google Agenda. Se a diária existiu e caiu, prefira cancelar: fica no histórico.`,
      destructive: true, confirmText: "Excluir",
    }))) return;
    excluir.mutate(d.id, {
      onSuccess: () => { toast.success("Diária excluída"); },
      onError: (e: any) => toast.error("Não excluiu", { description: e.message }),
    });
  };

  const removerDiaria = async (d: SaidaProducao) => {
    if (!(await confirmar({
      title: "Remover diária do saldo?",
      description: `${fmtData(d.data)}${d.local ? ` · ${d.local}` : ""} — será cancelada e deixará de consumir o contrato. O registro fica no histórico.`,
      destructive: true, confirmText: "Remover diária",
    }))) return;
    cancelar.mutate(d.id, {
      onSuccess: () => toast.success("Diária removida do saldo"),
      onError: (e: any) => toast.error("Não foi possível remover a diária", { description: e.message }),
    });
  };

  const mudarStatus = (d: SaidaProducao, novo: StatusSaida) => {
    if (novo === 'realizada' && d.data > hojeISO()) { toast.error('Uma diária futura deve ficar como agendada'); return; }
    salvar.mutate({ id: d.id, titulo: d.titulo, tipo: d.tipo, data: d.data, status: novo }, {
      onSuccess: () => toast.success('Status da diária atualizado'),
      onError: (e: any) => toast.error('Não foi possível atualizar a diária', { description: e.message }),
    });
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-foreground">Diárias de gravação</p>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {numero(total)}{contratadas > 0 ? ` de ${numero(contratadas)}` : ""} registradas · {numero(realizadas)} realizadas
              {restam > 0 ? ` · faltam ${numero(restam)}` : ""}
            </span>
          </div>
          {!abrindo && (
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={isLoading || isError} title="Bloqueia o dia da equipe escalada, aparece no Calendário e nas Saídas e publica no Google Agenda" onClick={() => setAbrindo(true)}>
              <Plus className="h-3.5 w-3.5" /> Adicionar diária
            </Button>
          )}
        </div>

        {contratadas > 0 && (
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-warning transition-all" style={{ width: `${Math.min(100, Math.round((total / contratadas) * 100))}%` }} />
          </div>
        )}

        {/* Agendar nova diária */}
        {abrindo && (
          <div className="mb-4 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={`${formId}-data`} className="mb-1 block text-[11px] text-muted-foreground">Data</label>
                <Input id={`${formId}-data`} type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9" />
              </div>
              <div>
                <label htmlFor={`${formId}-local`} className="mb-1 block text-[11px] text-muted-foreground">Local (opcional)</label>
                <Input id={`${formId}-local`} value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Onde grava" className="h-9" />
              </div>
            </div>
            <div>
              <label htmlFor={`${formId}-status`} className="mb-1 block text-xs text-muted-foreground">Situação da diária</label>
              <select id={`${formId}-status`} className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value as StatusSaida)}>
                <option value="agendada">Agendada</option><option value="realizada">Já realizada</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground" title="Bloqueia o dia de cada um">
                <Users className="h-3 w-3" /> Equipe escalada
              </label>
              <div className="flex flex-wrap gap-1.5">
                {membros.length === 0 && <span className="text-xs text-muted-foreground">Cadastre a equipe em Time.</span>}
                {membros.map((m: any) => {
                  const on = equipe.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMembro(m.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on ? "border-amber-500/50 bg-amber-500/15 text-warning" : "border-border/60 text-muted-foreground hover:border-amber-500/30"
                      }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Meia diária existe: meio período de gravação não consome o dia
                inteiro nem se cobra como tal. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Duração</span>
              {[{ v: 1, r: "Diária cheia" }, { v: 0.5, r: "Meia diária" }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={fracao === o.v}
                  onClick={() => setFracao(o.v)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    fracao === o.v ? "border-amber-500/50 bg-amber-500/15 text-warning" : "border-border/60 text-muted-foreground hover:border-amber-500/30"
                  }`}
                >
                  {o.r}
                </button>
              ))}
            </div>

            {/* Custos do dia, linha a linha. Antes eram três totais e quem
                agendava somava de cabeça — aluguel + combustível + pedágio —
                e o que estava dentro do número se perdia. */}
            <details><summary className="cursor-pointer text-xs text-muted-foreground">Custos da diária · opcional</summary><div className="mt-2"><CustosLinhas itens={custos} onChange={setCustos} compacto /></div></details>

            {/* Já agendado nesse dia pra este cliente? Avisa antes. */}
            {data && diaCompartilhado(data) && (
              <p
                className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-warning"
                title="Em outro projeto. Conta como uma diária só na cobrança — lance o custo em um projeto só."
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                Cliente já tem diária neste dia.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAbrindo(false); setData(""); setLocal(""); setEquipe([]); setFracao(1); setCustos([]); setStatus("agendada"); }}>
                Cancelar
              </Button>
              <Button size="sm" className="h-8 bg-amber-500 text-black hover:bg-amber-600" onClick={agendar} disabled={salvar.isPending || !data}>
                {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar diária"}
              </Button>
            </div>
          </div>
        )}

        {/* Lista */}
        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : isError ? (
          <p className="py-4 text-sm text-destructive">Não foi possível carregar as diárias. <button type="button" className="underline" onClick={() => refetch()}>Tentar novamente</button></p>
        ) : diarias.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma diária registrada.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {diarias.map((d) => {
              return (
                <li key={d.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${d.status === "cancelada" ? "opacity-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                      <span className="font-medium">{fmtData(d.data)}</span>
                      <select aria-label={`Status da diária de ${d.data}`} disabled={ocupado} value={d.status} onChange={e => mudarStatus(d, e.target.value as StatusSaida)} className="max-w-full rounded border bg-background px-2 py-1 text-xs">
                        <option value="agendada">Agendada</option><option value="confirmada">Confirmada</option><option value="realizada">Realizada</option>
                        {d.status === 'cancelada' && <option value="cancelada">Cancelada</option>}
                      </select>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {d.local && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{d.local}</span>}
                      {d.equipe?.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />{d.equipe.map(nomeMembro).join(", ")}
                        </span>
                      )}
                      {Number((d as any).fracao ?? 1) < 1 && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-warning">meia diária</span>
                      )}
                      {(() => {
                        const c = Number((d as any).custo_logistica || 0) + Number((d as any).custo_alimentacao || 0) + Number((d as any).custo_hospedagem || 0);
                        return c > 0 ? <span className="tabular-nums">custos {formatCurrency(c)}</span> : null;
                      })()}
                      {diaCompartilhado(d.data) && (
                        <span className="inline-flex items-center gap-1 text-warning" title="outro projeto deste cliente gravou no mesmo dia — conta como uma diária só">
                          <Link2 className="h-3 w-3" /> dia compartilhado
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {d.status !== "cancelada" && (
                      <button type="button" disabled={ocupado} aria-label={`Remover diária de ${d.data}`} title="Remove do saldo e preserva no histórico" onClick={() => removerDiaria(d)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-warning">
                        <X className="h-3.5 w-3.5" /> Remover
                      </button>
                    )}
                    <button type="button" disabled={ocupado} aria-label={`Excluir definitivamente diária de ${d.data}`} title="Excluir diária (some de vez)" onClick={() => excluirDiaria(d)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function fmtData(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}
