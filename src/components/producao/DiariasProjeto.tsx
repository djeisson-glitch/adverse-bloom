import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, MapPin, X, Loader2, Users, Fuel, UtensilsCrossed, BedDouble, Link2, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTeamMembers } from "@/hooks/useTeamMembers";
import {
  useSalvarSaida, useCancelarSaida, useExcluirSaida, STATUS_SAIDA_META, type SaidaProducao,
} from "@/hooks/useSaidasProducao";
import { toast } from "sonner";

/**
 * Diárias de gravação do projeto. As diárias vêm do orçamento como um SALDO
 * (diarias_contratadas) que a produção agenda em datas reais aqui. Cada diária
 * é uma producao_saidas (tipo='diaria'): aparece no Calendário e nas Saídas,
 * publica no Google Agenda e desconta a capacidade da semana da equipe escalada.
 */
export function DiariasProjeto({
  projectId, projectName, diariasContratadas, clientId,
}: {
  projectId: string;
  projectName: string;
  diariasContratadas: number;
  clientId?: string | null;
}) {
  const qc = useQueryClient();
  const confirmar = useConfirm();
  const { data: membros = [] } = useActiveTeamMembers();
  const salvar = useSalvarSaida();
  const cancelar = useCancelarSaida();
  const excluir = useExcluirSaida();

  const [abrindo, setAbrindo] = useState(false);
  const [data, setData] = useState("");
  const [local, setLocal] = useState("");
  const [equipe, setEquipe] = useState<string[]>([]);
  const [fracao, setFracao] = useState(1);
  const [custos, setCustos] = useState({ logistica: "", alimentacao: "", hospedagem: "" });

  const { data: diarias = [], isLoading } = useQuery({
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
  const restam = Math.max(0, contratadas - agendadas.length);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["projeto-diarias", projectId] });
    qc.invalidateQueries({ queryKey: ["producao_saidas"] });
  };

  const toggleMembro = (id: string) =>
    setEquipe((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const agendar = () => {
    if (!data) { toast.error("Escolha a data da diária"); return; }
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
        custo_logistica: Number(custos.logistica) || 0,
        custo_alimentacao: Number(custos.alimentacao) || 0,
        custo_hospedagem: Number(custos.hospedagem) || 0,
        status: "agendada",
      },
      {
        onSuccess: () => {
          setData(""); setLocal(""); setEquipe([]); setAbrindo(false);
          setFracao(1); setCustos({ logistica: "", alimentacao: "", hospedagem: "" });
          invalidar();
          toast.success("Diária agendada");
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
      onSuccess: () => { invalidar(); toast.success("Diária excluída"); },
      onError: (e: any) => toast.error("Não excluiu", { description: e.message }),
    });
  };

  const removerDiaria = async (d: SaidaProducao) => {
    if (!(await confirmar({
      title: "Cancelar diária?",
      description: `${fmtData(d.data)}${d.local ? ` · ${d.local}` : ""}`,
      destructive: true, confirmText: "Cancelar diária",
    }))) return;
    cancelar.mutate(d.id, { onSuccess: invalidar });
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-foreground">Diárias de gravação</p>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {agendadas.length}{contratadas > 0 ? ` de ${contratadas}` : ""} agendada{agendadas.length === 1 ? "" : "s"}
              {restam > 0 ? ` · faltam ${restam}` : ""}
            </span>
          </div>
          {!abrindo && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-warning hover:text-warning" onClick={() => setAbrindo(true)}>
              <Plus className="h-3.5 w-3.5" /> Agendar diária
            </Button>
          )}
        </div>

        {contratadas > 0 && (
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-warning transition-all" style={{ width: `${Math.min(100, Math.round((agendadas.length / contratadas) * 100))}%` }} />
          </div>
        )}

        {/* Agendar nova diária */}
        {abrindo && (
          <div className="mb-4 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Data</label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Local (opcional)</label>
                <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Onde grava" className="h-9" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" /> Equipe escalada (bloqueia o dia de cada um)
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
                  onClick={() => setFracao(o.v)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    fracao === o.v ? "border-amber-500/50 bg-amber-500/15 text-warning" : "border-border/60 text-muted-foreground hover:border-amber-500/30"
                  }`}
                >
                  {o.r}
                </button>
              ))}
            </div>

            {/* Custos do dia — repassados com margem própria e imposto. Ficam
                aqui porque quem agenda é quem sabe o que a saída vai custar. */}
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["logistica", "Logística", "carro, combustível", Fuel],
                ["alimentacao", "Alimentação", "equipe em campo", UtensilsCrossed],
                ["hospedagem", "Hospedagem", "se dormir fora", BedDouble],
              ] as const).map(([k, rot, dica, Icon]) => (
                <div key={k}>
                  <label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground" title={dica}>
                    <Icon className="h-3 w-3" /> {rot} (R$)
                  </label>
                  <Input
                    type="number" step="0.01" placeholder="0,00" className="h-9"
                    value={(custos as any)[k]}
                    onChange={(e) => setCustos({ ...custos, [k]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            {/* Já agendado nesse dia pra este cliente? Avisa antes. */}
            {data && diaCompartilhado(data) && (
              <p className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-warning">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                Este cliente já tem diária neste dia, em outro projeto. Conta como
                <b> uma</b> diária só na cobrança — mas lance o custo em um projeto só.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAbrindo(false); setData(""); setLocal(""); setEquipe([]); setFracao(1); setCustos({ logistica: "", alimentacao: "", hospedagem: "" }); }}>
                Cancelar
              </Button>
              <Button size="sm" className="h-8 bg-amber-500 text-black hover:bg-amber-600" onClick={agendar} disabled={salvar.isPending || !data}>
                {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Agendar"}
              </Button>
            </div>
          </div>
        )}

        {/* Lista */}
        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : diarias.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {contratadas > 0
              ? `${contratadas} diária(s) contratada(s) no orçamento. Agende as datas.`
              : "Nenhuma diária ainda. Agende os dias de gravação."}
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {diarias.map((d) => {
              const meta = STATUS_SAIDA_META[d.status];
              return (
                <li key={d.id} className={`flex items-center gap-3 py-2.5 ${d.status === "cancelada" ? "opacity-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-foreground">
                      <span className="font-medium">{fmtData(d.data)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.className}`}>{meta.label}</span>
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
                      <button title="Cancelar diária (fica no histórico)" onClick={() => removerDiaria(d)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-warning">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button title="Excluir diária (some de vez)" onClick={() => excluirDiaria(d)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground/70">
          Cada diária bloqueia o dia da equipe escalada — aparece no Calendário e nas Saídas, publica no Google Agenda e desconta a capacidade da semana.
        </p>
      </CardContent>
    </Card>
  );
}

function fmtData(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}
