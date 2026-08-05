import { useState, useEffect, useRef } from "react";
import { nomeDeEntregavel, nomeDeProjeto } from "@/lib/nomeCurto";
import { hojeISO } from "@/lib/dataLocal";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFiltro } from "@/hooks/useFiltro";
import { Inbox, Loader2, ChevronDown, ChevronRight, Paperclip, CheckCircle2, XCircle, ArrowRight, Clock, Sparkles, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

type Demanda = {
  id: string;
  client_id: string | null;
  solicitante_nome: string;
  solicitante_email: string;
  nome_projeto: string;
  entregas: any[];
  prazo_desejado: string | null;
  anexos: any[];
  viabilidade: any;
  ia_complexidade: any;
  status: string;
  projeto_id: string | null;
  created_at: string;
  client?: { name: string } | null;
};

const STATUS_BADGE: Record<string, string> = {
  nova: "bg-primary/15 text-primary",
  aceita: "bg-blue-500/15 text-info",
  recusada: "bg-red-500/15 text-destructive",
  virou_projeto: "bg-success/15 text-success",
};
const STATUS_LABEL: Record<string, string> = {
  nova: "Nova", aceita: "Aceita", recusada: "Recusada", virou_projeto: "Virou projeto",
};

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Demandas() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [aberta, setAberta] = useState<string | null>(null);
  const [filtro, setFiltro] = useFiltro<string>("filtro", "abertas", "demandas");

  const { data: demandas = [], isLoading } = useQuery({
    queryKey: ["demandas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("demandas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as Demanda[];
      // Nome do cliente vem da view pública (a tabela clients é trancada; a
      // coordenadora vê o nome, não a informação).
      const ids = [...new Set(rows.map((d) => d.client_id).filter(Boolean))] as string[];
      let nomes: Record<string, string> = {};
      if (ids.length) {
        const { data: cs } = await (supabase as any).from("clientes_publico").select("id, name").in("id", ids);
        nomes = Object.fromEntries((cs || []).map((c: any) => [c.id, c.name]));
      }
      return rows.map((d) => ({ ...d, client: d.client_id ? { name: nomes[d.client_id] || "" } : null }));
    },
  });

  const visiveis = demandas.filter((d) =>
    filtro === "todas" ? true : filtro === "abertas" ? d.status === "nova" || d.status === "aceita" : d.status === filtro,
  );
  const novas = demandas.filter((d) => d.status === "nova").length;

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("demandas").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demandas"] }),
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // Leitura de complexidade por IA (interno) — roda ao abrir a demanda.
  const analisar = useMutation({
    mutationFn: async (demandaId: string) => {
      const { data, error } = await (supabase as any).functions.invoke("intake-ia", { body: { demanda_id: demandaId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demandas"] }),
    onError: (e: any) =>
      toast.error("IA não rodou", {
        description: /ANTHROPIC|configurada/i.test(e.message || "")
          ? "Falta a chave da Anthropic no Supabase."
          : /not found|Function|Failed to send/i.test(e.message || "")
          ? "Publique a função: supabase functions deploy intake-ia."
          : e.message,
      }),
  });

  const autoRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!aberta) return;
    const d = demandas.find((x) => x.id === aberta);
    if (!d || d.ia_complexidade || d.status === "recusada") return;
    if (autoRef.current.has(d.id)) return;
    autoRef.current.add(d.id);
    analisar.mutate(d.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, demandas]);

  const virarProjeto = useMutation({
    mutationFn: async (d: Demanda) => {
      // editor padrão do cliente (pra já responsabilizar os entregáveis)
      let editorId: string | null = null;
      let clientName = d.client?.name || "";
      if (d.client_id) {
        const { data: cli } = await (supabase as any)
          .from("clientes_publico").select("name, intake_editor_id").eq("id", d.client_id).maybeSingle();
        editorId = cli?.intake_editor_id ?? null;
        clientName = cli?.name || clientName;
      }
      const prazoDate = d.prazo_desejado ? d.prazo_desejado.slice(0, 10) : null;
      const { data: proj, error: pErr } = await (supabase as any)
        .from("projects")
        .insert({
          // Nome do projeto sem o cliente repetido: a lista já agrupa por
          // cliente, e o intake costuma vir com ele colado no fim.
          name: nomeDeProjeto(d.nome_projeto, clientName),
          client_name: clientName,
          client_id: d.client_id,
          // ID da etapa, não o rótulo: o board filtra por id, e "Pré-produção"
          // fazia o projeto nascer sem coluna nenhuma — invisível na lista,
          // acessível só por link.
          status: "pre-producao",
          sold_date: hojeISO(),
          delivery_date: prazoDate,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      const entregas = Array.isArray(d.entregas) ? d.entregas : [];
      if (entregas.length > 0) {
        const rows = entregas.map((e: any, i: number) => ({
          project_id: proj.id,
          // Mesma regra da criação manual: prefixo "PÓS | " e sem redundância.
          // O fallback continua numerando, e cai na regra junto — "Vídeo 2"
          // vira "PÓS | 2" só se houver o que sobrar; senão volta inteiro.
          titulo: nomeDeEntregavel((e.titulo || "").trim() || `Peça ${i + 1}`, clientName),
          descricao: e.briefing || null,
          formato: e.formato || null,
          duracao: e.duracao || null,
          data_entrega: prazoDate,
          responsavel_id: editorId,
          ordem: i + 1,
        }));
        const { error: dErr } = await (supabase as any).from("deliverables").insert(rows);
        if (dErr) throw dErr;
      }

      // ANEXOS DO CLIENTE. Ficavam só na demanda: quem abria o projeto criado
      // não via nada e tinha que voltar na demanda, baixar e re-anexar à mão.
      // Vão como documento do PROJETO (tipo briefing) — de lá o entregável
      // também enxerga, porque é contexto da peça inteira, não de uma só.
      const anexos = Array.isArray((d as any).anexos) ? (d as any).anexos : [];
      if (anexos.length > 0) {
        const docs = anexos
          .filter((a: any) => a?.url)
          .map((a: any) => ({
            project_id: proj.id,
            titulo: a.nome || "Anexo do cliente",
            url: a.url,
            tipo: "briefing",
          }));
        if (docs.length > 0) {
          // Não derruba a conversão se o anexo falhar: o projeto já existe e
          // perder o vínculo é menos grave que perder o projeto. Avisa e segue.
          const { error: aErr } = await (supabase as any).from("project_documents").insert(docs);
          if (aErr) toast.error("Projeto criado, mas os anexos não foram", { description: aErr.message });
        }
      }

      const { error: uErr } = await (supabase as any)
        .from("demandas").update({ status: "virou_projeto", projeto_id: proj.id }).eq("id", d.id);
      if (uErr) throw uErr;
      return proj.id as string;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["demandas"] });
      toast.success("Projeto criado a partir da demanda");
      navigate(`/projetos/${projectId}`);
    },
    onError: (e: any) => toast.error("Não deu pra criar o projeto", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Inbox className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Demandas</h1>
          <p className="text-sm text-muted-foreground">Solicitações que chegaram pelos formulários dos clientes.</p>
        </div>
        {novas > 0 && <Badge className="bg-primary/15 text-primary">{novas} nova{novas > 1 ? "s" : ""}</Badge>}
      </div>

      <div className="flex gap-1.5">
        {[["abertas", "Abertas"], ["nova", "Novas"], ["virou_projeto", "Viraram projeto"], ["recusada", "Recusadas"], ["todas", "Todas"]].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`rounded-md px-2.5 py-1 text-xs ${filtro === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          Nenhuma demanda por aqui ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {visiveis.map((d) => {
            const open = aberta === d.id;
            const viab = d.viabilidade || {};
            const noPrazo = viab.no_prazo;
            return (
              <Card key={d.id} className="glass-card">
                <CardContent className="p-0">
                  <button onClick={() => setAberta(open ? null : d.id)} className="flex w-full items-center gap-3 p-4 text-left">
                    {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{d.nome_projeto}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.client?.name || "—"} · {d.solicitante_nome} · {Array.isArray(d.entregas) ? d.entregas.length : 0} vídeo(s)
                      </p>
                    </div>
                    {d.prazo_desejado && (
                      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                        <Clock className="h-3 w-3" /> pediu {fmtDateTime(d.prazo_desejado)}
                      </span>
                    )}
                    {d.viabilidade?.earliest && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${noPrazo ? "bg-success/15 text-success" : "bg-amber-500/15 text-warning"}`}>
                        {noPrazo ? "no prazo" : "apertado"}
                      </span>
                    )}
                    <Badge className={STATUS_BADGE[d.status] || "bg-muted text-muted-foreground"}>{STATUS_LABEL[d.status] || d.status}</Badge>
                  </button>

                  {open && (
                    <div className="space-y-4 border-t border-border/40 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Info label="Solicitante">{d.solicitante_nome} · {d.solicitante_email}</Info>
                        <Info label="Recebida">{formatDate(d.created_at)}</Info>
                        <Info label="Prazo pedido">{fmtDateTime(d.prazo_desejado)}</Info>
                        <Info label="Podemos entregar até">
                          <span className={noPrazo ? "text-success" : "text-warning"}>{fmtDateTime(d.viabilidade?.earliest)}</span>
                        </Info>
                      </div>

                      {d.viabilidade && (
                        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                          <p className="mb-1 font-medium text-foreground">Cálculo de viabilidade</p>
                          Fila do editor {Number(d.viabilidade.carga_horas || 0)}h + edição {Number(d.viabilidade.demanda_horas || 0)}h + revisão {Number(d.viabilidade.revisao_horas || 0)}h = <strong>{Number(d.viabilidade.total_horas || 0)}h úteis</strong>.
                          {d.viabilidade.complexidade && <> · complexidade da entrega: <strong>{d.viabilidade.complexidade}</strong></>}
                          {d.viabilidade.rodadas != null && <> · alteração projetada: <strong>{d.viabilidade.rodadas}×</strong> {d.viabilidade.rodadas_hist ? "(histórico do cliente)" : "(fator manual)"}</>}
                          {d.viabilidade.calibrado && <> · <strong className="text-warning">edição ×{d.viabilidade.calib_cliente}</strong> (o "simples" deste cliente costuma render mais — aprendido do timesheet)</>}
                          {d.viabilidade.sem_editor && <span className="text-warning"> · Sem editor configurado pro cliente — estimativa considera só a nova demanda.</span>}
                        </div>
                      )}

                      {/* Leitura de complexidade por IA (interno, automático ao abrir) */}
                      {(() => {
                        const ia = d.ia_complexidade;
                        const analisando = analisar.isPending && analisar.variables === d.id;
                        const cor = (c: string) =>
                          c === "alta" ? "bg-amber-500/15 text-warning" : c === "baixa" ? "bg-success/15 text-success" : "bg-primary/15 text-primary";
                        return (
                          <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3">
                            <div className="flex items-center justify-between">
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                <Sparkles className="h-3.5 w-3.5 text-primary" /> Complexidade (leitura de IA)
                              </p>
                              <button
                                onClick={() => analisar.mutate(d.id)}
                                disabled={analisando}
                                className="text-[11px] text-primary hover:underline disabled:opacity-50"
                              >
                                {analisando ? "analisando…" : ia ? "reanalisar" : "analisar"}
                              </button>
                            </div>
                            {analisando && !ia ? (
                              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Lendo o briefing…
                              </p>
                            ) : ia ? (
                              <div className="mt-2 space-y-2 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cor(ia.complexidade_geral)}`}>
                                    complexidade {ia.complexidade_geral}
                                  </span>
                                  {ia.horas_ajustadas != null && (
                                    <span className="text-muted-foreground">
                                      {Number(d.viabilidade?.total_horas || 0)}h → <strong className="text-foreground">~{ia.horas_ajustadas}h</strong> com a leitura (×{ia.fator_ajuste})
                                    </span>
                                  )}
                                </div>
                                {ia.nota && <p className="text-muted-foreground">{ia.nota}</p>}
                                {Array.isArray(ia.riscos) && ia.riscos.length > 0 && (
                                  <ul className="space-y-0.5">
                                    {ia.riscos.map((r: string, i: number) => (
                                      <li key={i} className="flex items-start gap-1">
                                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                                        <span className="text-muted-foreground">{r}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-muted-foreground">Abra pra analisar, ou clique em “analisar”.</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* Entregas */}
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entregas</p>
                        <div className="space-y-2">
                          {(Array.isArray(d.entregas) ? d.entregas : []).map((e: any, i: number) => (
                            <div key={i} className="rounded-md border border-border/40 bg-background/40 p-2.5 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{e.titulo || `Vídeo ${i + 1}`}</span>
                                {e.formato && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{e.formato}</span>}
                                {e.duracao && <span className="text-[10px] text-muted-foreground">{e.duracao}</span>}
                              </div>
                              {e.briefing && <p className="mt-1 text-xs text-muted-foreground">{e.briefing}</p>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Anexos */}
                      {Array.isArray(d.anexos) && d.anexos.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Anexos</p>
                          <div className="flex flex-wrap gap-2">
                            {d.anexos.map((a: any, i: number) => (
                              <a key={i} href={a.url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-xs text-foreground hover:border-primary/40">
                                <Paperclip className="h-3 w-3" /> {a.nome}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ações */}
                      {d.status === "virou_projeto" ? (
                        <Button size="sm" variant="outline" onClick={() => d.projeto_id && navigate(`/projetos/${d.projeto_id}`)}>
                          <ArrowRight className="mr-1 h-3.5 w-3.5" /> Abrir projeto
                        </Button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => virarProjeto.mutate(d)} disabled={virarProjeto.isPending} className="bg-primary text-primary-foreground">
                            {virarProjeto.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                            Virar projeto
                          </Button>
                          {d.status !== "recusada" && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: d.id, status: "recusada" })} className="text-muted-foreground hover:text-destructive">
                              <XCircle className="mr-1 h-3.5 w-3.5" /> Recusar
                            </Button>
                          )}
                        </div>
                      )}
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

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{children}</p>
    </div>
  );
}
