import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTimer } from "@/contexts/TimerContext";
import {
  ArrowLeft, Loader2, Save, ExternalLink, Film, CalendarClock, CheckCircle2,
  Play, Plus, Trash2, MessageSquarePlus, ThumbsUp, RefreshCw, Clock, Scissors, UserCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ComentariosSection } from "./ProjetoDetalhe";

/**
 * Detalhe do entregável — Onda 6A.
 * Unidade de produção: timesheet próprio, alterações do cliente (rastreáveis),
 * aprovação em 2 níveis (config global + override por projeto) e card de
 * análise de horas (edição pura × alteração do cliente).
 */

const STATUS_ENTREGAVEL = [
  { id: "pendente", label: "Pendente", tone: "muted" },
  { id: "em_edicao", label: "Em edição", tone: "primary" },
  { id: "revisao_n1", label: "Revisão N1", tone: "warning" },
  { id: "revisao_n2", label: "Revisão N2", tone: "warning" },
  { id: "com_cliente", label: "Com o cliente", tone: "primary" },
  { id: "ajuste_solicitado", label: "Ajuste solicitado", tone: "destructive" },
  { id: "aprovado", label: "Aprovado", tone: "success" },
  { id: "entregue", label: "Entregue", tone: "success" },
] as const;

function statusTone(id: string) {
  const s = STATUS_ENTREGAVEL.find((x) => x.id === id);
  const map: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
  };
  return map[s?.tone || "muted"];
}

function nomeDe(profiles: any[], uid: string | null | undefined) {
  if (!uid) return "—";
  const p = profiles.find((x) => x.id === uid);
  return p?.full_name || p?.email || "—";
}

export default function EntregavelDetalhe() {
  const { id: projectId, did } = useParams<{ id: string; did: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { start } = useTimer();

  const { data: entregavel, isLoading, isError, error } = useQuery({
    queryKey: ["entregavel", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("*, project:projects(id, numero, name, client_name, aprovador_n1_id, aprovador_n2_id, cliente_aprova)")
        .eq("id", did!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["entregavel-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .neq("ativo", false)
        .order("full_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: config } = useQuery({
    queryKey: ["approval-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("approval_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: alteracoes = [] } = useQuery({
    queryKey: ["entregavel-alteracoes", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverable_alteracoes")
        .select("*")
        .eq("deliverable_id", did!)
        .order("numero");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["entregavel-horas", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_entries")
        .select("id, user_id, duration_min, alteracao_id, start_at, description, pessoa:profiles(full_name, email)")
        .eq("deliverable_id", did!)
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [form, setForm] = useState<any>(null);
  if (entregavel && (!form || form.__id !== entregavel.id)) {
    // Re-hidrata sempre que muda o entregável (corrige bug de form preso)
    setForm({
      __id: entregavel.id,
      titulo: entregavel.titulo || "",
      status: entregavel.status || "pendente",
      formato: entregavel.formato || "",
      duracao: entregavel.duracao || "",
      responsavel_id: entregavel.responsavel_id || "",
      aprovador_id: entregavel.aprovador_id || "",
      data_entrega: entregavel.data_entrega || "",
      prazo_interno: entregavel.prazo_interno || "",
      arquivo_url: entregavel.arquivo_url || "",
      descricao: entregavel.descricao || "",
    });
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("deliverables")
        .update({
          titulo: form.titulo,
          status: form.status,
          formato: form.formato || null,
          duracao: form.duracao || null,
          responsavel_id: form.responsavel_id || null,
          aprovador_id: form.aprovador_id || null,
          data_entrega: form.data_entrega || null,
          prazo_interno: form.prazo_interno || null,
          arquivo_url: form.arquivo_url || null,
          descricao: form.descricao || null,
        })
        .eq("id", did);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entregavel", did] });
      toast.success("Entregável salvo");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // Agregações de horas
  const horas = useMemo(() => {
    const total = entries.reduce((s, e) => s + e.duration_min, 0);
    const pura = entries.filter((e) => !e.alteracao_id).reduce((s, e) => s + e.duration_min, 0);
    const alt = total - pura;
    const porAlteracao: Record<string, number> = {};
    entries.forEach((e) => {
      if (e.alteracao_id) porAlteracao[e.alteracao_id] = (porAlteracao[e.alteracao_id] || 0) + e.duration_min;
    });
    return { total: total / 60, pura: pura / 60, alt: alt / 60, porAlteracao };
  }, [entries]);

  // Erro na query (ex.: coluna/relação faltando, RLS, id inválido) → mostra o
  // motivo em vez de girar pra sempre.
  if (isError || (!isLoading && !entregavel)) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <button
          onClick={() => navigate(`/projetos/${projectId}`)}
          className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao projeto
        </button>
        <Card className="glass-card border-destructive/30">
          <CardContent className="space-y-2 p-6 text-center">
            <p className="text-sm font-medium text-foreground">Não consegui abrir este entregável</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message || "Entregável não encontrado ou sem acesso."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !entregavel || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const proj = entregavel.project;
  const set = (patch: any) => setForm({ ...form, ...patch });

  // Config efetiva de aprovação (override por projeto > global)
  const n1 = proj?.aprovador_n1_id ?? config?.nivel1_user_id ?? null;
  const n2 = proj?.aprovador_n2_id ?? config?.nivel2_user_id ?? null;
  const clienteAprova = proj?.cliente_aprova ?? config?.cliente_aprova ?? true;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 py-6">
      <button
        onClick={() => navigate(`/projetos/${projectId}`)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {proj?.name || "Projeto"}
      </button>

      {/* Header */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${statusTone(form.status)}`}>
                  {STATUS_ENTREGAVEL.find((s) => s.id === form.status)?.label || form.status}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Film className="h-3 w-3" /> Entregável
                </span>
              </div>
              <Input
                value={form.titulo}
                onChange={(e) => set({ titulo: e.target.value })}
                className="border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight hover:border-border focus:border-border"
              />
            </div>
            <div className="flex gap-2">
              <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ENTREGAVEL.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="bg-primary text-primary-foreground">
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Salvar
              </Button>
            </div>
          </div>

          <div className="grid gap-4 text-sm md:grid-cols-4">
            <Campo label="Projeto">
              <Link to={`/projetos/${projectId}`} className="text-primary hover:underline">
                {proj?.numero} · {proj?.name}
              </Link>
            </Campo>
            <Campo label="Formato">
              <Input value={form.formato} onChange={(e) => set({ formato: e.target.value })} placeholder="16x9" className="h-8" />
            </Campo>
            <Campo label="Duração">
              <Input value={form.duracao} onChange={(e) => set({ duracao: e.target.value })} placeholder='30"' className="h-8" />
            </Campo>
            <Campo label="Responsável">
              <span className="text-foreground">{nomeDe(profiles, form.responsavel_id)}</span>
            </Campo>
          </div>
        </CardContent>
      </Card>

      {/* Indicadores */}
      <div className="grid gap-4 md:grid-cols-4">
        <IndicadorCard label="Revisões internas" value={String(entregavel.revisoes_internas || 0)} icon={RefreshCw} hint="N1/N2 pediram ajuste" />
        <IndicadorCard label="Alterações do cliente" value={String(alteracoes.length)} icon={MessageSquarePlus} hint={`${alteracoes.filter((a) => a.status === "aberta").length} abertas`} tone="destructive" />
        <IndicadorCard label="Horas — edição pura" value={`${horas.pura.toFixed(1)}h`} icon={Scissors} />
        <IndicadorCard label="Horas — alteração cliente" value={`${horas.alt.toFixed(1)}h`} icon={MessageSquarePlus} tone="warning" />
      </div>

      <AprovacaoCard
        entregavel={entregavel}
        did={did!}
        userId={user?.id}
        n1={n1}
        n2={n2}
        clienteAprova={clienteAprova}
        profiles={profiles}
        onChanged={() => qc.invalidateQueries({ queryKey: ["entregavel", did] })}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Timesheet do entregável */}
          <TimesheetEntregavel
            did={did!}
            projectId={projectId!}
            entries={entries}
            horasTotal={horas.total}
            onStart={() => start({ project_id: projectId!, project_name: proj?.name || "", deliverable_id: did! })}
            onChanged={() => qc.invalidateQueries({ queryKey: ["entregavel-horas", did] })}
          />

          {/* Alterações do cliente */}
          <AlteracoesSection
            did={did!}
            projectId={projectId!}
            projectName={proj?.name || ""}
            alteracoes={alteracoes}
            horasPorAlteracao={horas.porAlteracao}
            onStart={(alteracaoId) =>
              start({ project_id: projectId!, project_name: proj?.name || "", deliverable_id: did!, alteracao_id: alteracaoId })
            }
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ["entregavel-alteracoes", did] });
              qc.invalidateQueries({ queryKey: ["entregavel", did] });
            }}
          />

          {/* Detalhes / prazos / briefing */}
          <Card className="glass-card">
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <div>
                <Label>Responsável</Label>
                <Select value={form.responsavel_id || "__none__"} onValueChange={(v) => set({ responsavel_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem responsável —</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Prazo interno</Label>
                <Input type="date" value={form.prazo_interno} onChange={(e) => set({ prazo_interno: e.target.value })} />
              </div>
              <div>
                <Label className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Prazo do cliente</Label>
                <Input type="date" value={form.data_entrega} onChange={(e) => set({ data_entrega: e.target.value })} />
              </div>
              <div>
                <Label>Link do arquivo / Frame.io</Label>
                <div className="flex gap-2">
                  <Input value={form.arquivo_url} onChange={(e) => set({ arquivo_url: e.target.value })} placeholder="https://frame.io/…" />
                  {form.arquivo_url && (
                    <a href={form.arquivo_url} target="_blank" rel="noreferrer" className="flex items-center rounded-md border border-border px-3 text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>Briefing / observações deste entregável</Label>
                <Textarea rows={5} value={form.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="Direcionamento, referências, o que precisa entregar…" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  <Save className="mr-1 h-3.5 w-3.5" /> Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Canal da peça */}
        <Card className="glass-card lg:sticky lg:top-20">
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Canal da peça</p>
              <p className="text-[10px] text-muted-foreground">Conversa operacional só deste entregável. Use @nome pra mencionar.</p>
            </div>
            <ComentariosSection entityType="deliverable" entityId={did!} profiles={profiles} compact vazio="Sem mensagens ainda. A conversa do entregável começa aqui." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------ Aprovação em 2 níveis */

function AprovacaoCard({
  entregavel, did, userId, n1, n2, clienteAprova, profiles, onChanged,
}: {
  entregavel: any; did: string; userId?: string; n1: string | null; n2: string | null;
  clienteAprova: boolean; profiles: any[]; onChanged: () => void;
}) {
  const [ajusteNota, setAjusteNota] = useState("");
  const [mostrarAjuste, setMostrarAjuste] = useState(false);

  const patch = async (updates: any, msgOk: string) => {
    const { error } = await (supabase as any).from("deliverables").update(updates).eq("id", did);
    if (error) return toast.error("Erro", { description: error.message });
    onChanged();
    toast.success(msgOk);
  };

  const aprovarN1 = () =>
    patch({ aprovado_n1_por: userId, aprovado_n1_em: new Date().toISOString(), status: "revisao_n2" }, "Aprovado no N1 → segue pra N2");
  const aprovarN2 = () =>
    patch(
      {
        aprovado_n2_por: userId,
        aprovado_n2_em: new Date().toISOString(),
        status: clienteAprova ? "com_cliente" : "aprovado",
      },
      clienteAprova ? "Aprovado no N2 → enviado ao cliente" : "Aprovado no N2",
    );
  const pedirAjuste = async () => {
    // Revisão interna: incrementa contador + volta pra edição (NÃO cria alteração)
    const { error } = await (supabase as any)
      .from("deliverables")
      .update({ revisoes_internas: (entregavel.revisoes_internas || 0) + 1, status: "em_edicao" })
      .eq("id", did);
    if (error) return toast.error("Erro", { description: error.message });
    if (ajusteNota.trim() && userId) {
      await (supabase as any).from("comments").insert({
        entity_type: "deliverable", entity_id: did, user_id: userId,
        body: `🔧 Ajuste interno pedido: ${ajusteNota.trim()}`, mentions: [],
      });
    }
    setAjusteNota("");
    setMostrarAjuste(false);
    onChanged();
    toast.info("Revisão interna registrada — voltou pra edição");
  };

  const isN1 = !!userId && !!n1 && userId === n1;
  const isN2 = !!userId && !!n2 && userId === n2;
  const podeAprovar = isN1 || isN2;

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Aprovação</p>
            <p className="text-xs text-muted-foreground">
              N1 {nomeDe(profiles, n1)} · N2 {nomeDe(profiles, n2)} · Cliente {clienteAprova ? "aprova" : "só visualiza"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Nivel ok={!!entregavel.aprovado_n1_em} label="N1" quem={nomeDe(profiles, entregavel.aprovado_n1_por)} />
            <Nivel ok={!!entregavel.aprovado_n2_em} label="N2" quem={nomeDe(profiles, entregavel.aprovado_n2_por)} />
            {clienteAprova && (
              <Nivel ok={!!entregavel.aprovado_cliente_em} label="Cliente" quem={entregavel.aprovado_cliente_por || "—"} />
            )}
          </div>
        </div>

        {podeAprovar ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {isN1 && !entregavel.aprovado_n1_em && (
                <Button size="sm" onClick={aprovarN1} className="bg-success text-white hover:bg-success/90">
                  <ThumbsUp className="mr-1 h-3.5 w-3.5" /> Aprovar N1
                </Button>
              )}
              {isN2 && entregavel.aprovado_n1_em && !entregavel.aprovado_n2_em && (
                <Button size="sm" onClick={aprovarN2} className="bg-success text-white hover:bg-success/90">
                  <ThumbsUp className="mr-1 h-3.5 w-3.5" /> Aprovar N2
                </Button>
              )}
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setMostrarAjuste((v) => !v)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Pedir ajuste
              </Button>
            </div>
            {mostrarAjuste && (
              <div className="flex items-center gap-2">
                <Input value={ajusteNota} onChange={(e) => setAjusteNota(e.target.value)} placeholder="O que precisa ajustar? (revisão interna)" className="h-8" />
                <Button size="sm" onClick={pedirAjuste}>Registrar</Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            <UserCheck className="mr-1 inline h-3.5 w-3.5" />
            Você não é aprovador deste entregável. Configure os aprovadores em Admin ou na ficha do projeto.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Nivel({ ok, label, quem }: { ok: boolean; label: string; quem: string }) {
  return (
    <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 ${ok ? "bg-success/15 text-success" : "bg-muted/50 text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {label}
      {ok && <span className="opacity-70">· {quem}</span>}
    </span>
  );
}

/* ------------------------------------------------ Timesheet do entregável */

function TimesheetEntregavel({
  did, projectId, entries, horasTotal, onStart, onChanged,
}: {
  did: string; projectId: string; entries: any[]; horasTotal: number;
  onStart: () => void; onChanged: () => void;
}) {
  const { user } = useAuth();
  const [dur, setDur] = useState("");
  const [desc, setDesc] = useState("");

  const lancar = useMutation({
    mutationFn: async () => {
      const min = Math.round(Number(dur.replace(",", ".")) * 60);
      if (!min || min <= 0 || Number.isNaN(min)) throw new Error("Informe as horas");
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: user?.id,
        project_id: projectId,
        deliverable_id: did,
        start_at: new Date().toISOString(),
        duration_min: min,
        description: desc || null,
        billable: true,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDur(""); setDesc("");
      onChanged();
      toast.success("Horas lançadas no entregável");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Timesheet do entregável</p>
            <p className="text-xs text-muted-foreground">Total rastreado: <strong>{horasTotal.toFixed(1)}h</strong></p>
          </div>
          <Button size="sm" variant="outline" onClick={onStart} title="Iniciar timer neste entregável">
            <Play className="mr-1 h-3.5 w-3.5 fill-current" /> Apontar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input value={dur} onChange={(e) => setDur(e.target.value)} placeholder="horas (ex.: 1.5)" className="h-8 w-32" />
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="O que foi feito? (edição pura)" className="h-8 flex-1" />
          <Button size="sm" onClick={() => lancar.mutate()} disabled={lancar.isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Lançar
          </Button>
        </div>

        {entries.length > 0 && (
          <div className="space-y-1">
            {entries.map((e) => (
              <div key={e.id} className="grid grid-cols-[90px_1fr_120px_60px_30px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{new Date(e.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
                <span className="truncate text-foreground">{e.description || (e.alteracao_id ? "alteração cliente" : "edição")}</span>
                <span className="truncate text-muted-foreground">{e.pessoa?.full_name || "—"}</span>
                <span className="text-right">{(e.duration_min / 60).toFixed(1)}h</span>
                <button onClick={() => excluir.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------ Alterações do cliente */

function AlteracoesSection({
  did, projectId, projectName, alteracoes, horasPorAlteracao, onStart, onChanged,
}: {
  did: string; projectId: string; projectName: string; alteracoes: any[];
  horasPorAlteracao: Record<string, number>; onStart: (alteracaoId: string) => void; onChanged: () => void;
}) {
  const { user } = useAuth();
  const [nova, setNova] = useState({ titulo: "", descricao: "" });
  const [aberto, setAberto] = useState(false);

  const criar = useMutation({
    mutationFn: async () => {
      if (!nova.titulo.trim()) throw new Error("Informe o título da alteração");
      const prox = (alteracoes.at(-1)?.numero ?? 0) + 1;
      const { error } = await (supabase as any).from("deliverable_alteracoes").insert({
        deliverable_id: did,
        numero: prox,
        titulo: nova.titulo,
        descricao: nova.descricao || null,
        origem: "cliente",
        criado_por: user?.email || "equipe",
      });
      if (error) throw error;
      await (supabase as any).from("deliverables").update({ status: "ajuste_solicitado" }).eq("id", did);
    },
    onSuccess: () => {
      setNova({ titulo: "", descricao: "" });
      setAberto(false);
      onChanged();
      toast.success("Alteração do cliente registrada");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const resolver = useMutation({
    mutationFn: async (a: any) => {
      const novoStatus = a.status === "resolvida" ? "aberta" : "resolvida";
      const { error } = await (supabase as any)
        .from("deliverable_alteracoes")
        .update({ status: novoStatus, resolved_at: novoStatus === "resolvida" ? new Date().toISOString() : null })
        .eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Alterações do cliente</p>
            <p className="text-xs text-muted-foreground">Pedidos do cliente (portal ou registrados aqui). Cada uma rastreia horas próprias.</p>
          </div>
          <Button size="sm" onClick={() => setAberto((v) => !v)} className="bg-primary text-primary-foreground">
            <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Alteração do cliente
          </Button>
        </div>

        {aberto && (
          <div className="space-y-2 rounded-md border border-dashed border-border/60 p-3">
            <Input value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} placeholder="Título (ex.: Trocar trilha, cortar cena 3)" />
            <Textarea rows={2} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} placeholder="O que o cliente pediu…" />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => criar.mutate()} disabled={criar.isPending}>Registrar alteração</Button>
            </div>
          </div>
        )}

        {alteracoes.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Nenhuma alteração do cliente ainda.</p>
        ) : (
          alteracoes.map((a) => (
            <div key={a.id} className="rounded-md border border-border/40 bg-muted/10 p-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">R{a.numero}</span>
                <span className="flex-1 truncate text-sm font-medium text-foreground">{a.titulo}</span>
                <span className="text-xs text-muted-foreground">{((horasPorAlteracao[a.id] || 0) / 60).toFixed(1)}h</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${a.status === "resolvida" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {a.status}
                </span>
              </div>
              {a.descricao && <p className="mt-1 text-xs text-muted-foreground">{a.descricao}</p>}
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7" onClick={() => onStart(a.id)}>
                  <Play className="mr-1 h-3 w-3 fill-current" /> Apontar nesta alteração
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => resolver.mutate(a)}>
                  {a.status === "resolvida" ? "Reabrir" : "Marcar resolvida"}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------ helpers de UI */

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function IndicadorCard({
  label, value, icon: Icon, hint, tone,
}: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>; hint?: string;
  tone?: "warning" | "destructive";
}) {
  const cls = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card className="glass-card">
      <CardContent className="space-y-1 p-4">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${cls}`}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
