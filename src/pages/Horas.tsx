import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Timer, Plus, Trash2, CalendarCheck, Play, Check, X, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { statusLabel } from "@/lib/statusEntregavel";
import { parseDuracaoMin, fmtDuracao, ETAPAS_TRABALHO } from "@/lib/duracao";
import { toast } from "sonner";

type Entry = {
  id: string;
  user_id: string;
  project_id: string;
  start_at: string;
  duration_min: number;
  description: string | null;
  billable: boolean;
  source: string;
  project?: { name: string; client_name?: string | null } | null;
  deliverable?: { titulo: string } | null;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "2026-06" -> "junho/2026" (pro toast e o rótulo do período). */
function rotuloMes(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}


/** Status que tiram o projeto da lista do dia a dia (mas não do retroativo). */
const FINALIZADOS = ["finalizado", "entregue", "faturado"];

export default function Horas() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = usePermissions();

  const [form, setForm] = useState({
    project_id: "",
    deliverable_id: "",  // opcional — amarra a hora à peça, não só ao projeto
    pessoa: "",          // admin lança pra outra pessoa; vazio = eu
    data: iso(new Date()),
    inicio: "09:00",
    duracao: "60",
    descricao: "",
    faturavel: true,
  });

  // Filtro da LISTA — separado do "lançar para" do formulário. Antes eram a
  // mesma coisa, e escolher alguém pra lançar trocava a lista embaixo.
  // Vazio = o time inteiro (admin) ou só as suas (todo o resto).
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const viewUserId = isAdmin ? (filtroPessoa || null) : user?.id;
  const vendoTodos = isAdmin && !filtroPessoa;
  const suasHoras = viewUserId === user?.id;

  // Mês que a lista mostra (YYYY-MM). Começa no atual. O lançamento retroativo
  // (horas antigas do ClickUp) grava certo, mas com a janela travada no mês
  // corrente ele SUMIA da lista — dava "registrei mas não aparece". Agora dá
  // pra escolher o mês e conferir, e o lançamento recua a janela sozinho.
  const mesAtual = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [verMes, setVerMes] = useState(mesAtual);
  // Abre a lista de projetos pros já entregues — pra apontar hora retroativa.
  const [incluirEntregues, setIncluirEntregues] = useState(false);
  const ehMesAtual = verMes === mesAtual;

  // Janela do mês escolhido. No mês corrente recua 14 dias pra pegar o
  // apontamento que cruza a virada; em mês passado, o mês inteiro.
  const fromDate = useMemo(() => {
    const [y, m] = verMes.split("-").map(Number);
    const inicioMes = new Date(y, m - 1, 1, 0, 0, 0, 0);
    if (verMes === mesAtual) {
      const d14 = new Date();
      d14.setDate(d14.getDate() - 14);
      d14.setHours(0, 0, 0, 0);
      return (inicioMes < d14 ? inicioMes : d14).toISOString();
    }
    return inicioMes.toISOString();
  }, [verMes, mesAtual]);
  // Mês passado tem teto (só aquele mês); mês atual segue em aberto (pega hoje
  // e futuro). Sem teto, escolher junho traria junho+julho+... misturado.
  const toDate = useMemo(() => {
    if (verMes === mesAtual) return null;
    const [y, m] = verMes.split("-").map(Number);
    return new Date(y, m, 1, 0, 0, 0, 0).toISOString();
  }, [verMes, mesAtual]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["horas-profiles"],
    enabled: isAdmin,
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name, email").order("full_name")).data || [],
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["horas-me", viewUserId ?? "todos", verMes],
    enabled: !!user,
    queryFn: async () => {
      let q = (supabase as any)
        .from("time_entries")
        .select("*, project:projects(name, client_name), deliverable:deliverables(titulo)")
        .gte("start_at", fromDate);
      // Sem viewUserId = o time inteiro (só admin chega aqui). A RLS decide de
      // verdade; isto é só não pedir o que não viria.
      if (viewUserId) q = q.eq("user_id", viewUserId);
      if (toDate) q = q.lt("start_at", toDate);
      const { data, error } = await q.order("start_at", { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });

  /**
   * Projetos do lançamento manual.
   *
   * Por padrão só os EM ANDAMENTO — a lista com os 180+ do histórico seria
   * impossível de garimpar no dia a dia. Mas apontar hora retroativa quase
   * sempre é justamente num projeto já entregue (a pessoa lembra depois), e
   * antes isso era impossível: o filtro escondia esses projetos e não havia
   * como lançar. A chave abaixo abre a lista inteira quando for esse o caso.
   */
  const { data: projects = [] } = useQuery({
    queryKey: ["horas-projects", incluirEntregues],
    queryFn: async () => {
      let q = supabase.from("projects").select("id, name, client_name, status");
      if (!incluirEntregues) q = q.not("status", "in", `(${FINALIZADOS.join(",")})`);
      const { data, error } = await q.order("name");
      if (error) throw error;
      // Entregues no fim: o que está em andamento é o caso comum.
      return ((data as any[]) || []).sort(
        (a, b) => Number(FINALIZADOS.includes(a.status)) - Number(FINALIZADOS.includes(b.status)),
      );
    },
  });

  /**
   * Entregáveis do projeto escolhido — TODOS, inclusive aprovado/entregue.
   * O lançamento retroativo é justamente pra peça que já fechou; filtrar por
   * status aqui repetiria o problema que a chave "incluir entregues" resolveu
   * no seletor de projeto.
   */
  const { data: entregaveis = [] } = useQuery({
    queryKey: ["horas-entregaveis", form.project_id],
    enabled: !!form.project_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status")
        .eq("project_id", form.project_id)
        .order("created_at");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  /** Quem está com o cronômetro rodando agora (inclui os outros, se admin). */
  const { data: rodando = [] } = useQuery({
    queryKey: ["horas-rodando"],
    refetchInterval: 30_000,   // o contador anda; 30s é o suficiente pra tela
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("horas_rodando_agora");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Timer dos outros começando/parando aparece sem refresh.
  useEffect(() => {
    const ch = supabase
      .channel("horas-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["horas-rodando"] });
        qc.invalidateQueries({ queryKey: ["horas-me"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const totalHoras = useMemo(
    () => entries.reduce((sum, e) => sum + e.duration_min, 0) / 60,
    [entries],
  );
  // O que o campo de duração vira em minutos, pro feedback ao vivo e pra
  // travar o botão quando o texto não faz sentido.
  const duracaoMin = parseDuracaoMin(form.duracao);

  const lancar = useMutation({
    mutationFn: async () => {
      if (!form.project_id) throw new Error("Escolha um projeto");
      if (!form.data) throw new Error("Informe a data");
      const min = parseDuracaoMin(form.duracao);
      if (!min || min <= 0) throw new Error('Duração não entendida — tente "2h10", "90min" ou "1:30".');
      const [h, m] = form.inicio.split(":").map(Number);
      const start = new Date(`${form.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
      const alvo = (isAdmin && form.pessoa) ? form.pessoa : null;   // null = eu (o RPC resolve)
      const { error } = await (supabase as any).rpc("lancar_horas_manual", {
        _project_id: form.project_id,
        _start_at: start.toISOString(),
        _duration_min: min,
        _description: form.descricao || null,
        _billable: form.faturavel,
        _user_id: alvo,
        _deliverable_id: form.deliverable_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Lançou antes do mês que a lista mostra? Pula a janela pra lá, senão o
      // registro fica invisível e parece que não gravou. (form.data sobrevive
      // ao reset abaixo — só descrição/duração são limpos.)
      const mesLancado = form.data?.slice(0, 7);
      const foraDaJanela = mesLancado && mesLancado < verMes;
      if (foraDaJanela) setVerMes(mesLancado);
      setForm({ ...form, descricao: "", duracao: "60" });
      qc.invalidateQueries({ queryKey: ["horas-me"] });
      const nome = form.pessoa ? (profiles.find((p: any) => p.id === form.pessoa)?.full_name || "a pessoa") : "você";
      toast.success(
        foraDaJanela
          ? `Horas lançadas para ${nome} — mostrando ${rotuloMes(mesLancado)}`
          : `Horas lançadas para ${nome}`,
      );
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      // .select() de propósito: sem ele o PostgREST devolve 204 mesmo quando a
      // RLS barra, e a tela cantaria vitória sem ter apagado nada.
      const { data, error } = await (supabase as any)
        .from("time_entries").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Você não tem permissão para excluir este apontamento.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["horas-me"] });
      toast.success("Apontamento excluído");
    },
    onError: (e: any) => toast.error("Não deu pra excluir", { description: e.message }),
  });

  /** Correção de um apontamento já lançado — duração e descrição (admin). */
  const [editando, setEditando] = useState<{ id: string; duracao: string; descricao: string } | null>(null);
  const editar = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      const min = parseDuracaoMin(editando.duracao);
      if (!min || min <= 0) throw new Error('Duração não entendida — tente "2h10", "90min" ou "1:30".');
      const { data, error } = await (supabase as any)
        .from("time_entries")
        .update({ duration_min: min, description: editando.descricao || null })
        .eq("id", editando.id)
        .select("id");   // mesma armadilha do 204: sem isto, bloqueio vira "sucesso"
      if (error) throw error;
      if (!data?.length) throw new Error("Você não tem permissão para corrigir este apontamento.");
    },
    onSuccess: () => {
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["horas-me"] });
      toast.success("Apontamento corrigido");
    },
    onError: (e: any) => toast.error("Não deu pra corrigir", { description: e.message }),
  });

  /** Nome de quem apontou — só o admin carrega profiles, que é quando precisa. */
  const nomeDe = (id: string) => {
    const p = profiles.find((x: any) => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Timer className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {vendoTodos ? "Horas do time" : suasHoras ? "Minhas horas" : `Horas — ${nomeDe(viewUserId!)}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ehMesAtual ? "Este mês" : rotuloMes(verMes)} · total <strong>{totalHoras.toFixed(1)}h</strong>
              {rodando.length > 0 && <> · <strong>{rodando.length}</strong> {rodando.length === 1 ? "cronômetro rodando" : "cronômetros rodando"}</>}
              {isAdmin && <> · você pode corrigir, excluir e lançar retroativo.</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Escolher o mês pra conferir o retroativo que foi lançado. Sem
              isso, só dava pra ver o mês corrente. */}
          {isAdmin && (
            <div className="flex flex-col">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pessoa</Label>
              <Select value={filtroPessoa || "__todos__"} onValueChange={(v) => setFiltroPessoa(v === "__todos__" ? "" : v)}>
                <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos__">Todo o time</SelectItem>
                  {profiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ver mês</Label>
            <Input
              type="month"
              value={verMes}
              max={mesAtual}
              onChange={(e) => setVerMes(e.target.value || mesAtual)}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => toast.info("Importar da agenda chega em melhoria futura")}>
            <CalendarCheck className="mr-1 h-3.5 w-3.5" />
            Importar da agenda
          </Button>
        </div>
      </div>

      {/* Lançamento manual é ferramenta de CORREÇÃO, não de rotina: a hora
          normal entra pelo cronômetro. Por isso o formulário é só do admin. */}
      {isAdmin && (
      <Card className="glass-card">
        <CardContent className="space-y-4 p-5">
          {isAdmin && (
            <div>
              <Label>Lançar para</Label>
              <Select value={form.pessoa || "__me__"} onValueChange={(v) => setForm({ ...form, pessoa: v === "__me__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__me__">Eu mesmo</SelectItem>
                  {profiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Só admin lança horas de outra pessoa (ex.: retroativo do ClickUp por editor).</p>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <Label>Projeto</Label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-primary"
                    checked={incluirEntregues}
                    onChange={(e) => setIncluirEntregues(e.target.checked)}
                  />
                  incluir entregues
                </label>
              </div>
              {/* Trocar de projeto zera o entregável: manter a peça do projeto
                  anterior gravaria a hora no lugar errado, em silêncio. */}
              <Select
                value={form.project_id}
                onValueChange={(v) => setForm({ ...form, project_id: v, deliverable_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— selecione —" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.client_name || "—"}
                      {FINALIZADOS.includes(p.status) && (
                        <span className="ml-1 text-muted-foreground">· entregue</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Entregável é opcional: sem ele a hora fica no projeto, como
                  antes. Com ele, aparece no relatório da peça. */}
              {form.project_id && entregaveis.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">Entregável (opcional)</Label>
                  <Select
                    value={form.deliverable_id || "__nenhum__"}
                    onValueChange={(v) => setForm({ ...form, deliverable_id: v === "__nenhum__" ? "" : v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhum__">— projeto inteiro —</SelectItem>
                      {entregaveis.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.titulo}
                          <span className="ml-1 text-muted-foreground">· {statusLabel(d.status)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label>Início</Label>
                <Input type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
              </div>
              <div>
                <Label>Duração</Label>
                <Input
                  type="text"
                  inputMode="text"
                  placeholder="2h10, 90min, 1:30"
                  value={form.duracao}
                  onChange={(e) => setForm({ ...form, duracao: e.target.value })}
                />
                {/* Feedback ao vivo do que o sistema entendeu — sem isso, digitar
                    "2h10" e não saber se virou 130min ou erro é um tiro no escuro. */}
                {form.duracao.trim() && (
                  duracaoMin
                    ? <p className="mt-1 text-[11px] text-success">= {fmtDuracao(duracaoMin)} · {duracaoMin} min</p>
                    : <p className="mt-1 text-[11px] text-destructive">não entendi — tente 2h10, 90min ou 1:30</p>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Etapa</Label>
            <Select
              value={form.descricao || undefined}
              onValueChange={(v) => setForm({ ...form, descricao: v })}
            >
              <SelectTrigger><SelectValue placeholder="— o que foi feito —" /></SelectTrigger>
              <SelectContent>
                {ETAPAS_TRABALHO.map((etapa) => (
                  <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form.faturavel}
                onChange={(e) => setForm({ ...form, faturavel: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Faturável
            </label>
            <Button onClick={() => lancar.mutate()} disabled={lancar.isPending || !duracaoMin} className="bg-primary text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> Lançar horas
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {rodando.length > 0 && (
        <Card className="glass-card border-primary/30">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border/40 px-5 py-2.5">
              <Play className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Rodando agora</span>
            </div>
            {rodando.map((r: any) => (
              <div
                key={r.user_id}
                className="grid grid-cols-[1fr_140px_70px] items-center gap-3 border-b border-border/40 px-5 py-3 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-foreground">
                    {r.entregavel || r.projeto || "Sem projeto"}
                    {r.cliente && <span className="text-muted-foreground"> · {r.cliente}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.entregavel && r.projeto ? `${r.projeto} · ` : ""}{r.description || "sem descrição"}
                  </p>
                </div>
                <span className="truncate text-xs text-muted-foreground">{r.pessoa}</span>
                {/* Contagem parcial: o tempo só vira apontamento quando a
                    pessoa para o próprio cronômetro. */}
                <span className="text-right text-xs font-medium text-primary">{fmtDuracao(r.minutos || 0)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum apontamento ainda. Inicie o timer ou lance manualmente acima.
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[86px_1fr_110px_64px_28px_52px] items-center gap-3 border-b border-border/40 px-5 py-3 text-sm last:border-0"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(e.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </span>
                {editando?.id === e.id ? (
                  <Input
                    value={editando.descricao}
                    onChange={(ev) => setEditando({ ...editando, descricao: ev.target.value })}
                    placeholder="Descrição"
                    className="h-8 text-xs"
                  />
                ) : (
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{e.project?.name || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {/* A peça vem antes da descrição: é ela que confirma se a
                          hora caiu no lugar certo. */}
                      {e.deliverable?.titulo && <span className="text-foreground/70">{e.deliverable.titulo} · </span>}
                      {e.description || "—"}
                    </p>
                  </div>
                )}
                {/* Vendo o time inteiro, quem apontou importa mais que a origem. */}
                <span className="truncate text-xs text-muted-foreground">
                  {vendoTodos ? nomeDe(e.user_id) : e.source}
                </span>
                {editando?.id === e.id ? (
                  <Input
                    value={editando.duracao}
                    onChange={(ev) => setEditando({ ...editando, duracao: ev.target.value })}
                    className="h-8 text-xs"
                  />
                ) : (
                  <span className="text-right text-xs">{fmtDuracao(e.duration_min)}</span>
                )}
                <span className={`text-xs ${e.billable ? "text-success" : "text-muted-foreground"}`}>
                  {e.billable ? "R$" : "—"}
                </span>
                <div className="flex items-center justify-end gap-2">
                  {editando?.id === e.id ? (
                    <>
                      <button onClick={() => editar.mutate()} disabled={editar.isPending} className="text-muted-foreground hover:text-success" title="Salvar">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditando(null)} className="text-muted-foreground hover:text-foreground" title="Cancelar">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {isAdmin && (
                        <button
                          onClick={() => setEditando({ id: e.id, duracao: String(e.duration_min), descricao: e.description || "" })}
                          className="text-muted-foreground hover:text-primary"
                          title="Corrigir"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(isAdmin || e.user_id === user?.id) && (
                        <button onClick={() => excluir.mutate(e.id)} className="text-muted-foreground hover:text-destructive" title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
