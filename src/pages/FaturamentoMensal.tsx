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
  Clock, FileText, MessageSquareWarning, Users, AlertTriangle,
} from "lucide-react";

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
  revisado: { label: "Revisado", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30", next: "enviado", nextLabel: "Marcar enviado" },
  enviado: { label: "Enviado", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30", next: "faturado", nextLabel: "Marcar faturado" },
  faturado: { label: "Faturado", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

function mesPrimeiroDia(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 10);
}
function fmtHoras(h: number) {
  return `${(h || 0).toFixed(2).replace(".", ",")}h`;
}

export default function FaturamentoMensal() {
  const qc = useQueryClient();
  // padrão: mês anterior (é o que o dia 01 fatura)
  const [ref, setRef] = useState(() => mesPrimeiroDia(-1));
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
        <Button variant="outline" size="sm" onClick={() => setRef(() => { const [y, m] = ref.split("-").map(Number); return new Date(y, m - 2, 1).toISOString().slice(0, 10); })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold capitalize text-foreground">{mesLabel}</p>
          <p className="text-xs text-muted-foreground">{faturas.length} cliente(s) · total {formatCurrency(totalMes)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRef(() => { const [y, m] = ref.split("-").map(Number); return new Date(y, m, 1).toISOString().slice(0, 10); })}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

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
                        <Kpi label={`Imposto ${f.imposto_percent}%`} v={formatCurrency(f.imposto_valor)} />
                        <Kpi label="Total" v={formatCurrency(f.total)} destaque />
                      </div>

                      {/* Saúde (contrato/tabela × nosso valor-hora) */}
                      {saude && (
                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${dif >= 0 ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
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
                        <Bloco icon={<Receipt className="h-3.5 w-3.5" />} titulo="Entregas do mês">
                          <div className="space-y-1">
                            {f.detalhe.itens.map((it: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="truncate text-muted-foreground">{it.entregavel} {it.tipo ? `· ${it.tipo}` : <span className="text-amber-400">· sem preço</span>}</span>
                                <span className="text-foreground">{formatCurrency(it.preco || 0)}</span>
                              </div>
                            ))}
                          </div>
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
                            <p className="text-[11px] text-amber-500">
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
