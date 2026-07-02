import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimer } from "@/contexts/TimerContext";
import {
  ArrowLeft, Loader2, Play, Plus, Trash2, Table2, BarChart3, Send, Save, X,
  FileText, Link2, ExternalLink, MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

/**
 * Ficha de projeto no layout Catalunya OS (single-page) — modelado a partir
 * da exploração ao vivo do catalunyaos.com em 2026-07-02:
 * header c/ Peças · Horas por pessoa/tarefa · Apontar no projeto, tarefas
 * inline com timer e 6 status, entregáveis c/ Frame.io, Fechamento
 * Orçado × Realizado, custo da equipe, custos diretos, faturamento e
 * comentários com @menção.
 */

export const TASK_STATUSES = [
  { id: "aguardando_inicio", label: "aguardando início" },
  { id: "em_andamento", label: "em andamento" },
  { id: "aprovacao_interna", label: "aprovação interna" },
  { id: "aguardando_cliente", label: "aguardando cliente" },
  { id: "aprovado", label: "aprovado" },
  { id: "finalizado", label: "finalizado" },
] as const;

const PRIORIDADES = [
  { id: "urgente", label: "Urgente" },
  { id: "alta", label: "Alta" },
  { id: "normal", label: "Normal" },
  { id: "baixa", label: "Baixa" },
] as const;

const TIPOS_CUSTO = [
  { id: "fornecedor", label: "Fornecedor" },
  { id: "producao", label: "Produção" },
  { id: "equipamento", label: "Equipamento" },
  { id: "outro", label: "Outro" },
] as const;

type ProjetoTab = "entregaveis" | "tarefas" | "briefing" | "fechamento";

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canSeeMoney } = usePermissions();
  const { start } = useTimer();
  const [tab, setTab] = useState<ProjetoTab>("entregaveis");

  const { data: project, isLoading } = useQuery({
    queryKey: ["projeto", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["projeto-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, custo_hora")
        .neq("ativo", false)
        .order("full_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["projeto-members", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_members")
        .select("*")
        .eq("project_id", id!);
      if (error) throw error;
      return data as any[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["projeto", id] });
    qc.invalidateQueries({ queryKey: ["projeto-members", id] });
  };

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 py-6">
      <button
        onClick={() => navigate("/projetos")}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Projetos em andamento
      </button>

      {/* ---------- Header ---------- */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                {project.numero || "—"} <span className="ml-2">{project.client_name}</span>
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.name}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/projetos/${project.id}/pecas`}>
                <Button variant="outline" size="sm" title="Controle de peças (cartelas, versões, locutor)">
                  <Table2 className="mr-1.5 h-3.5 w-3.5" />
                  Peças
                </Button>
              </Link>
              <Link to={`/relatorios/projeto/${project.id}`}>
                <Button variant="outline" size="sm" title="Horas mapeadas por pessoa e por tarefa">
                  <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                  Horas por pessoa/tarefa
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => start({ project_id: project.id, project_name: project.name })}
                title="Iniciar timer neste projeto"
              >
                <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                Apontar no projeto
              </Button>
            </div>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-4">
            <HeaderInfo label="Status" value={project.status || "—"} />
            <HeaderInfo label="Valor" value={canSeeMoney ? formatCurrency(project.sold_value || 0) : "—"} />
            <HeaderInfo
              label="Custo/hora"
              value={project.custo_hora_padrao ? formatCurrency(project.custo_hora_padrao) : "—"}
            />
            <HeaderInfo label="Diretor" value={project.diretor || "—"} />
          </div>

          <EquipeAvatars members={members} profiles={profiles} projectId={project.id} onChanged={invalidate} />
        </CardContent>
      </Card>

      {/* ---------- Conteúdo (tabs) + painel lateral de comentários ---------- */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Navegação por seções */}
          <div className="flex gap-1 overflow-x-auto border-b border-border/60">
            {(
              [
                { id: "entregaveis", label: "Entregáveis" },
                { id: "tarefas", label: "Tarefas" },
                { id: "briefing", label: "Briefing & Docs" },
                ...(canSeeMoney ? [{ id: "fechamento", label: "Fechamento" }] : []),
              ] as { id: ProjetoTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${
                  tab === t.id
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "entregaveis" && <EntregaveisSection projectId={project.id} profiles={profiles} />}

          {tab === "tarefas" && (
            <TarefasSection projectId={project.id} projectName={project.name} profiles={profiles} />
          )}

          {tab === "briefing" && (
            <>
              <BriefingProjetoSection project={project} onChanged={invalidate} />
              <DocumentosSection projectId={project.id} />
            </>
          )}

          {tab === "fechamento" && canSeeMoney && (
            <>
              <FechamentoSection project={project} onChanged={invalidate} />
              <FaturamentoSection project={project} />
            </>
          )}
        </div>

        {/* Painel de comentários sempre aberto — contexto por projeto/tarefa */}
        <ComentariosPainel
          projectId={project.id}
          projectName={project.name}
          profiles={profiles}
        />
      </div>
    </div>
  );
}

function HeaderInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------ Equipe */

function EquipeAvatars({
  members, profiles, projectId, onChanged,
}: {
  members: any[];
  profiles: any[];
  projectId: string;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!adding) throw new Error("Escolha alguém");
      const { error } = await (supabase as any)
        .from("project_members")
        .insert({ project_id: projectId, user_id: adding });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdding("");
      onChanged();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const profileOf = (uid: string) => profiles.find((p) => p.id === uid);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Equipe:</span>
      {members.map((m) => {
        const p = profileOf(m.user_id);
        const name = p?.full_name || p?.email || "?";
        return (
          <Avatar key={m.id} className="h-7 w-7" title={name}>
            <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
              {name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        );
      })}
      <Select value={adding} onValueChange={setAdding}>
        <SelectTrigger className="h-7 w-44 text-xs">
          <SelectValue placeholder="+ adicionar pessoa" />
        </SelectTrigger>
        <SelectContent>
          {profiles
            .filter((p) => !members.some((m) => m.user_id === p.id))
            .map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name || p.email}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {adding && (
        <Button size="sm" className="h-7" onClick={() => add.mutate()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Tarefas */

function TarefasSection({
  projectId, projectName, profiles,
}: {
  projectId: string;
  projectName: string;
  profiles: any[];
}) {
  const qc = useQueryClient();
  const [nova, setNova] = useState("");

  const { data: tasks = [] } = useQuery({
    queryKey: ["projeto-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["projeto-tasks", projectId] });
    qc.invalidateQueries({ queryKey: ["projeto", projectId] });
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!nova.trim()) throw new Error("Digite o nome da tarefa");
      const { error } = await (supabase as any).from("tasks").insert({
        project_id: projectId,
        title: nova.trim(),
        status: "aguardando_inicio",
        ordem: tasks.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNova("");
      invalidate();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // Agrupa por status na ordem do workflow
  const grupos = useMemo(() => {
    const m = new Map<string, any[]>();
    tasks.forEach((t) => {
      const s = t.status || "aguardando_inicio";
      m.set(s, [...(m.get(s) || []), t]);
    });
    return TASK_STATUSES.filter((s) => m.has(s.id)).map((s) => ({
      status: s,
      items: m.get(s.id)!,
    }));
  }, [tasks]);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Lista de tarefas ({tasks.length})
        </p>

        {grupos.map(({ status, items }) => (
          <div key={status.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {status.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{items.length}</span>
            </div>
            <div className="grid grid-cols-[1fr_150px_130px_110px_70px_60px_170px_30px] gap-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Nome</span>
              <span>Resp.</span>
              <span>Prazo</span>
              <span>Prioridade</span>
              <span>Estim.</span>
              <span>Rastreado</span>
              <span>Status</span>
              <span />
            </div>
            {items.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                profiles={profiles}
                projectName={projectName}
                onChanged={invalidate}
              />
            ))}
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar.mutate()}
            placeholder="Nova tarefa…"
            className="h-9"
          />
          <Button onClick={() => criar.mutate()} className="bg-primary text-primary-foreground">
            Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskRow({
  task, profiles, projectName, onChanged,
}: {
  task: any;
  profiles: any[];
  projectName: string;
  onChanged: () => void;
}) {
  const { start } = useTimer();
  const [title, setTitle] = useState(task.title);

  const patch = async (updates: Record<string, any>) => {
    const { error } = await (supabase as any).from("tasks").update(updates).eq("id", task.id);
    if (error) toast.error("Erro", { description: error.message });
    else onChanged();
  };

  const excluir = async () => {
    const { error } = await (supabase as any).from("tasks").delete().eq("id", task.id);
    if (error) toast.error("Erro", { description: error.message });
    else onChanged();
  };

  return (
    <div className="grid grid-cols-[1fr_150px_130px_110px_70px_60px_170px_30px] items-center gap-1">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== task.title && patch({ title })}
        className="h-8 border-transparent bg-transparent text-sm hover:border-border focus:border-border"
      />
      <Select
        value={task.assigned_user_id || "none"}
        onValueChange={(v) => patch({ assigned_user_id: v === "none" ? null : v })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name || p.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        defaultValue={task.due_date || ""}
        onBlur={(e) => e.target.value !== (task.due_date || "") && patch({ due_date: e.target.value || null })}
        className="h-8 text-xs"
      />
      <Select value={task.priority || "none"} onValueChange={(v) => patch({ priority: v === "none" ? null : v })}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {PRIORIDADES.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        defaultValue={task.estimativa_horas ?? ""}
        placeholder="—"
        onBlur={(e) =>
          Number(e.target.value || 0) !== Number(task.estimativa_horas || 0) &&
          patch({ estimativa_horas: e.target.value ? Number(e.target.value) : null })
        }
        className="h-8 text-xs"
        title="Estimativa (h)"
      />
      <button
        onClick={() =>
          start({
            project_id: task.project_id,
            project_name: projectName,
            task_id: task.id,
            task_title: task.title,
          })
        }
        className="flex h-8 items-center justify-center text-muted-foreground hover:text-primary"
        title="Iniciar timer aqui"
      >
        <Play className="h-3.5 w-3.5" />
      </button>
      <Select value={task.status || "aguardando_inicio"} onValueChange={(v) => patch({ status: v, completed: v === "finalizado", completed_at: v === "finalizado" ? new Date().toISOString() : null })}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button onClick={excluir} className="text-muted-foreground hover:text-destructive" title="Excluir">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ----------------------------------------------- Briefing (visão macro) */

const BRIEFING_CAMPOS = [
  {
    key: "briefing_consolidado",
    label: "Briefing consolidado",
    placeholder: "Contexto do job, referências e direcionamento geral",
    full: true,
  },
  {
    key: "escopo_vendido",
    label: "Escopo vendido",
    placeholder: "Entregáveis contratados, formatos e quantidades",
    full: true,
  },
  {
    key: "objetivos",
    label: "Objetivos",
    placeholder: "Objetivos da peça/campanha",
    full: false,
  },
  {
    key: "restricoes",
    label: "Restrições",
    placeholder: "Restrições de execução, compliance, prazo ou formato",
    full: false,
  },
  {
    key: "observacoes_cliente",
    label: "Observações do cliente",
    placeholder: "Observações relevantes trazidas pelo atendimento",
    full: true,
  },
] as const;

function BriefingProjetoSection({ project, onChanged }: { project: any; onChanged: () => void }) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(BRIEFING_CAMPOS.map((c) => [c.key, project[c.key] || ""])),
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("projects").update(form).eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onChanged();
      toast.success("Briefing salvo");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Briefing</p>
            <p className="text-xs text-muted-foreground">
              Consolide o contexto, escopo e direcionamento geral do projeto
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" />
            Salvar
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {BRIEFING_CAMPOS.map((c) => (
            <div key={c.key} className={c.full ? "md:col-span-2" : ""}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {c.label}
              </p>
              <Textarea
                rows={c.full ? 3 : 3}
                value={form[c.key]}
                onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                placeholder={c.placeholder}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------- Documentos (links) */

function DocumentosSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [novo, setNovo] = useState({ titulo: "", url: "" });

  const { data: docs = [] } = useQuery({
    queryKey: ["project-documents", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_documents")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!novo.titulo.trim() || !novo.url.trim()) throw new Error("Informe título e link");
      const url = novo.url.startsWith("http") ? novo.url : `https://${novo.url}`;
      const { error } = await (supabase as any).from("project_documents").insert({
        project_id: projectId,
        titulo: novo.titulo.trim(),
        url,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ titulo: "", url: "" });
      qc.invalidateQueries({ queryKey: ["project-documents", projectId] });
      toast.success("Documento adicionado");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("project_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-documents", projectId] }),
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-6">
        <div>
          <p className="text-sm font-semibold text-foreground">Documentos</p>
          <p className="text-xs text-muted-foreground">
            Links de Docs, Drive, Notion e referências do projeto
          </p>
        </div>

        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-sm font-medium text-foreground">{d.titulo}</span>
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:text-primary"
            >
              {d.url}
            </a>
            <a href={d.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={() => excluir.mutate(d.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Título (ex.: Roteiro no Docs)"
            value={novo.titulo}
            onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
            className="h-9 w-56"
          />
          <Input
            placeholder="https://docs.google.com/…"
            value={novo.url}
            onChange={(e) => setNovo({ ...novo, url: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && criar.mutate()}
            className="h-9 flex-1"
          />
          <Button size="sm" onClick={() => criar.mutate()} disabled={criar.isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------- Entregáveis */

function EntregaveisSection({ projectId, profiles }: { projectId: string; profiles: any[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [novo, setNovo] = useState({
    titulo: "",
    formato: "",
    duracao: "",
    arquivo_url: "",
    responsavel_id: "",
    data_entrega: "",
  });

  const nomeDe = (uid: string | null) => {
    if (!uid) return "—";
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name || p?.email || "—";
  };

  const { data: items = [] } = useQuery({
    queryKey: ["deliverables", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("*")
        .eq("project_id", projectId)
        .order("ordem");
      if (error) throw error;
      return data as any[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!novo.titulo.trim()) throw new Error("Informe o nome");
      const { error } = await (supabase as any).from("deliverables").insert({
        project_id: projectId,
        titulo: novo.titulo,
        formato: novo.formato || null,
        duracao: novo.duracao || null,
        arquivo_url: novo.arquivo_url || null,
        responsavel_id: novo.responsavel_id || null,
        data_entrega: novo.data_entrega || null,
        ordem: items.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ titulo: "", formato: "", duracao: "", arquivo_url: "", responsavel_id: "", data_entrega: "" });
      qc.invalidateQueries({ queryKey: ["deliverables", projectId] });
      toast.success("Entregável criado");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("deliverables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliverables", projectId] }),
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Entregáveis
        </p>

        {items.length > 0 && (
          <div className="grid grid-cols-[1fr_90px_70px_140px_100px_1fr_90px_30px] gap-2 px-3 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Entregável</span>
            <span>Formato</span>
            <span>Duração</span>
            <span>Responsável</span>
            <span>Entrega</span>
            <span>Link</span>
            <span>Status</span>
            <span />
          </div>
        )}
        {items.map((d) => (
          <div
            key={d.id}
            onClick={() => navigate(`/projetos/${projectId}/entregaveis/${d.id}`)}
            className="grid cursor-pointer grid-cols-[1fr_90px_70px_140px_100px_1fr_90px_30px] items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-sm hover:border-primary/40 hover:bg-sidebar-accent/40"
          >
            <span className="truncate font-medium text-foreground">{d.titulo}</span>
            <span className="text-xs text-muted-foreground">{d.formato || "—"}</span>
            <span className="text-xs text-muted-foreground">{d.duracao || "—"}</span>
            <span className="truncate text-xs text-muted-foreground">{nomeDe(d.responsavel_id)}</span>
            <span className="text-xs text-muted-foreground">
              {d.data_entrega ? new Date(d.data_entrega).toLocaleDateString("pt-BR") : "—"}
            </span>
            {d.arquivo_url ? (
              <a
                href={d.arquivo_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate text-xs text-primary hover:underline"
              >
                {d.arquivo_url}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">sem link</span>
            )}
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-center text-[10px] text-muted-foreground">
              {d.status}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                excluir.mutate(d.id);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <div className="space-y-2 rounded-md border border-dashed border-border/60 p-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              placeholder="Nome do entregável"
              value={novo.titulo}
              onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
              className="md:col-span-2"
            />
            <Input
              placeholder='Formato (16x9)'
              value={novo.formato}
              onChange={(e) => setNovo({ ...novo, formato: e.target.value })}
            />
            <Input
              placeholder='Duração (30")'
              value={novo.duracao}
              onChange={(e) => setNovo({ ...novo, duracao: e.target.value })}
            />
            <Select
              value={novo.responsavel_id}
              onValueChange={(v) => setNovo({ ...novo, responsavel_id: v === "__none__" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— sem responsável —</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              title="Data de entrega"
              value={novo.data_entrega}
              onChange={(e) => setNovo({ ...novo, data_entrega: e.target.value })}
            />
            <Input
              placeholder="Link Frame.io"
              value={novo.arquivo_url}
              onChange={(e) => setNovo({ ...novo, arquivo_url: e.target.value })}
              className="md:col-span-2"
            />
          </div>
          <Button
            onClick={() => criar.mutate()}
            className="w-full bg-primary text-primary-foreground"
          >
            + Entregável
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------- Fechamento Orçado × Realizado */

function FechamentoSection({ project, onChanged }: { project: any; onChanged: () => void }) {
  const qc = useQueryClient();
  const [fallback, setFallback] = useState<string>(project.custo_hora_padrao?.toString() || "");
  const [novoCusto, setNovoCusto] = useState({ tipo: "fornecedor", descricao: "", valor: "" });

  // Realizado — custo da equipe (view) + custos lançados
  const { data: custoEquipe = [] } = useQuery({
    queryKey: ["custo-equipe", project.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_custo_equipe_projeto")
        .select("*")
        .eq("project_id", project.id);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: custosLancados = [] } = useQuery({
    queryKey: ["custos-lancados", project.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_costs_lancados")
        .select("*")
        .eq("project_id", project.id)
        .order("data", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Membros sem horas também aparecem (padrão Catalunya)
  const { data: members = [] } = useQuery({
    queryKey: ["projeto-members", project.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_members")
        .select("*, profile:profiles(id, full_name, email, custo_hora)")
        .eq("project_id", project.id);
      if (error) throw error;
      return data as any[];
    },
  });

  // Orçado — composição do orçamento de origem
  const { data: orcado } = useQuery({
    queryKey: ["orcado", project.budget_id],
    enabled: !!project.budget_id,
    queryFn: async () => {
      const [{ data: comp }, { data: budget }] = await Promise.all([
        (supabase as any)
          .from("budget_composicao_horas")
          .select("horas, preco_hora, custo_hora")
          .eq("budget_id", project.budget_id),
        (supabase as any)
          .from("budgets")
          .select("total_value")
          .eq("id", project.budget_id)
          .single(),
      ]);
      const horas = (comp || []).reduce((s: number, c: any) => s + Number(c.horas), 0);
      const custo = (comp || []).reduce(
        (s: number, c: any) => s + Number(c.horas) * Number(c.custo_hora),
        0,
      );
      return { horas, custo, receita: Number(budget?.total_value || 0) };
    },
  });

  const horasRealizadas = custoEquipe.reduce((s, r) => s + Number(r.horas || 0), 0);
  const custoEquipeTotal = custoEquipe.reduce((s, r) => s + Number(r.custo || 0), 0);
  const custosLancadosTotal = custosLancados.reduce((s, c) => s + Number(c.valor || 0), 0);
  const receita = Number(project.sold_value || 0);
  const custoRealizado = custoEquipeTotal + custosLancadosTotal;
  const margemRealizada = receita - custoRealizado;

  const receitaOrcada = orcado?.receita || receita;
  const custoOrcado = orcado?.custo || 0;
  const margemOrcada = receitaOrcada - custoOrcado;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["custo-equipe", project.id] });
    qc.invalidateQueries({ queryKey: ["custos-lancados", project.id] });
    onChanged();
  };

  const salvarFallback = async () => {
    const { error } = await (supabase as any)
      .from("projects")
      .update({ custo_hora_padrao: fallback ? Number(fallback) : null })
      .eq("id", project.id);
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Fallback salvo");
      invalidateAll();
    }
  };

  const salvarCustoHoraPessoa = async (userId: string, valor: string) => {
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ custo_hora: valor ? Number(valor) : null })
      .eq("id", userId);
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Custo/hora da pessoa salvo (vale em todos os projetos)");
      invalidateAll();
    }
  };

  const addCusto = useMutation({
    mutationFn: async () => {
      if (!novoCusto.descricao || !novoCusto.valor) throw new Error("Descrição e valor");
      const { error } = await (supabase as any).from("project_costs_lancados").insert({
        project_id: project.id,
        tipo: novoCusto.tipo,
        descricao: novoCusto.descricao,
        valor: Number(novoCusto.valor),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovoCusto({ tipo: "fornecedor", descricao: "", valor: "" });
      invalidateAll();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // Merge: pessoas com horas + membros sem horas
  const linhasEquipe = useMemo(() => {
    const byId = new Map<string, any>();
    custoEquipe.forEach((r) =>
      byId.set(r.user_id, {
        user_id: r.user_id,
        nome: r.full_name || r.email,
        horas: Number(r.horas || 0),
        custo_hora: r.custo_hora_efetivo,
        custo: Number(r.custo || 0),
      }),
    );
    members.forEach((m) => {
      if (!byId.has(m.user_id)) {
        byId.set(m.user_id, {
          user_id: m.user_id,
          nome: m.profile?.full_name || m.profile?.email || "?",
          horas: 0,
          custo_hora: m.profile?.custo_hora ?? null,
          custo: 0,
        });
      }
    });
    return Array.from(byId.values());
  }, [custoEquipe, members]);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-5 p-6">
        <p className="text-sm font-semibold text-foreground">⚖️ Fechamento — Orçado × Realizado</p>

        <div className="overflow-hidden rounded-md border border-border/40">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 border-b border-border/40 bg-muted/20 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span />
            <span className="text-right">Orçado</span>
            <span className="text-right">Realizado</span>
          </div>
          <LinhaFech label="Horas" orc={`${orcado?.horas || 0}h`} real={`${horasRealizadas.toFixed(1)}h`} />
          <LinhaFech label="Receita" orc={formatCurrency(receitaOrcada)} real={formatCurrency(receita)} />
          <LinhaFech label="Custo" orc={formatCurrency(custoOrcado)} real={formatCurrency(custoRealizado)} />
          <LinhaFech
            label="Margem"
            orc={`${formatCurrency(margemOrcada)} (${receitaOrcada > 0 ? Math.round((margemOrcada / receitaOrcada) * 100) : 0}%)`}
            real={`${formatCurrency(margemRealizada)} (${receita > 0 ? Math.round((margemRealizada / receita) * 100) : 0}%)`}
            destaque
          />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Realizado = valor do projeto − (custo de cada pessoa: horas × o custo/hora dela) − custos
          diretos. Orçado vem da composição do orçamento de origem.
        </p>

        {/* Custo da equipe */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Custo da equipe (realizado)
          </p>
          <div className="grid grid-cols-[1fr_80px_160px_120px] gap-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Pessoa</span>
            <span className="text-right">Horas</span>
            <span>Custo/hora (BRL)</span>
            <span className="text-right">Custo</span>
          </div>
          {linhasEquipe.length === 0 ? (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              Adicione pessoas à equipe no topo — elas aparecem aqui (mesmo sem horas) pra você definir
              o custo/hora.
            </p>
          ) : (
            linhasEquipe.map((r) => (
              <div key={r.user_id} className="grid grid-cols-[1fr_80px_160px_120px] items-center gap-2">
                <span className="truncate text-sm text-foreground">{r.nome}</span>
                <span className="text-right text-xs">{r.horas.toFixed(1)}h</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    defaultValue={r.custo_hora ?? ""}
                    placeholder="—"
                    onBlur={(e) => salvarCustoHoraPessoa(r.user_id, e.target.value)}
                    className="h-7 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">ok</span>
                </div>
                <span className="text-right text-sm">{formatCurrency(r.custo)}</span>
              </div>
            ))
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Cada pessoa usa o seu custo/hora (por senioridade) — vale em todos os projetos dela. Quem
            não tiver valor próprio cai no padrão do projeto abaixo.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Custo/hora padrão do projeto — fallback (BRL)</span>
            <Input
              type="number"
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              className="h-8 w-28 text-xs"
            />
            <Button size="sm" variant="outline" onClick={salvarFallback}>
              <Save className="mr-1 h-3 w-3" />
              Salvar
            </Button>
          </div>
        </div>

        {/* Custos diretos */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Custos diretos lançados
          </p>
          {custosLancados.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                {c.tipo}
              </span>
              <span className="flex-1 truncate text-foreground">{c.descricao}</span>
              <span className="text-sm">{formatCurrency(c.valor)}</span>
              <button
                onClick={async () => {
                  await (supabase as any).from("project_costs_lancados").delete().eq("id", c.id);
                  invalidateAll();
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={novoCusto.tipo} onValueChange={(v) => setNovoCusto({ ...novoCusto, tipo: v })}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_CUSTO.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Descrição"
              value={novoCusto.descricao}
              onChange={(e) => setNovoCusto({ ...novoCusto, descricao: e.target.value })}
              className="h-8 flex-1 text-xs"
            />
            <Input
              type="number"
              placeholder="R$"
              value={novoCusto.valor}
              onChange={(e) => setNovoCusto({ ...novoCusto, valor: e.target.value })}
              className="h-8 w-24 text-xs"
            />
            <Button size="sm" onClick={() => addCusto.mutate()}>
              <Plus className="mr-1 h-3 w-3" />
              Custo
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaFech({
  label, orc, real, destaque,
}: {
  label: string;
  orc: string;
  real: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[120px_1fr_1fr] gap-2 border-b border-border/30 px-4 py-2 text-sm last:border-0 ${
        destaque ? "font-semibold" : ""
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{orc}</span>
      <span className={`text-right ${destaque ? "text-success" : "text-foreground"}`}>{real}</span>
    </div>
  );
}

/* --------------------------------------------------------- Faturamento */

function FaturamentoSection({ project }: { project: any }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: invoices = [] } = useQuery({
    queryKey: ["projeto-invoices", project.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, numero, valor, status")
        .eq("project_id", project.id);
      if (error) throw error;
      return data as any[];
    },
  });

  const faturado = invoices.reduce((s, i) => s + Number(i.valor || 0), 0);
  const faltaFaturar = Math.max(0, Number(project.sold_value || 0) - faturado);

  const gerar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("invoices").insert({
        client_id: project.client_id,
        project_id: project.id,
        valor: faltaFaturar,
        descricao: `Faturamento — ${project.name}`,
        status: "rascunho",
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projeto-invoices", project.id] });
      toast.success("Fatura gerada como rascunho — veja em Faturamento");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Card className="glass-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <p className="text-sm font-semibold text-foreground">Faturamento</p>
          <p className="text-xs text-muted-foreground">
            Falta faturar: <strong className="text-primary">{formatCurrency(faltaFaturar)}</strong>
            {invoices.length > 0 && (
              <>
                {" "}
                · {invoices.length} fatura(s) ·{" "}
                <Link to="/faturamento" className="text-primary hover:underline">
                  ver todas
                </Link>
              </>
            )}
          </p>
        </div>
        {faltaFaturar > 0 && (
          <Button onClick={() => gerar.mutate()} disabled={gerar.isPending} className="bg-primary text-primary-foreground">
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Gerar fatura de {formatCurrency(faltaFaturar)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------- Comentários */

type CommentEntity = "project" | "deal" | "task" | "deliverable";

export function ComentariosSection({
  entityType, entityId, profiles, titulo = "Comentários", vazio, compact,
}: {
  entityType: CommentEntity;
  entityId: string;
  profiles: any[];
  titulo?: string;
  vazio?: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comments")
        .select("*, author:profiles(full_name, email)")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Escreva algo");
      // Extrai @menções pelo nome (primeiro nome, case-insensitive)
      const mentions = profiles
        .filter((p) => {
          const nome = (p.full_name || "").split(" ")[0].toLowerCase();
          return nome && body.toLowerCase().includes(`@${nome}`);
        })
        .map((p) => p.id);
      const { error } = await (supabase as any).from("comments").insert({
        entity_type: entityType,
        entity_id: entityId,
        user_id: user?.id,
        body: body.trim(),
        mentions,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["comments", entityType, entityId] });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const lista = (
    <>
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {vazio || "Nenhum comentário ainda. Use @nome para mencionar alguém."}
        </p>
      ) : (
        <div className={`space-y-3 ${compact ? "max-h-[45vh] overflow-y-auto pr-1" : ""}`}>
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
                  {(c.author?.full_name || c.author?.email || "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {c.author?.full_name || c.author?.email}
                  </span>{" "}
                  · {new Date(c.created_at).toLocaleString("pt-BR")}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escreva uma mensagem…  use @nome para mencionar"
          className="flex-1"
        />
        <Button
          onClick={() => enviar.mutate()}
          disabled={enviar.isPending}
          className="self-end bg-primary text-primary-foreground"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  );

  // Modo compacto: só o conteúdo (o painel lateral fornece o card e o header)
  if (compact) return <div className="space-y-3">{lista}</div>;

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-6">
        <p className="text-sm font-semibold text-foreground">
          {titulo} ({comments.length})
        </p>
        {lista}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Painel lateral de comentários (projeto/tarefa) */

function ComentariosPainel({
  projectId, projectName, profiles,
}: {
  projectId: string;
  projectName: string;
  profiles: any[];
}) {
  // Contexto: "project" (geral) ou o id de uma tarefa
  const [contexto, setContexto] = useState<string>("project");

  const { data: tasks = [] } = useQuery({
    queryKey: ["projeto-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("id, title, status")
        .eq("project_id", projectId)
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const isProjeto = contexto === "project";
  const tarefaSel = tasks.find((t) => t.id === contexto);

  return (
    <Card className="glass-card lg:sticky lg:top-20">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Comentários</p>
        </div>

        {/* Seletor de contexto — separa a conversa do projeto de cada tarefa */}
        <Select value={contexto} onValueChange={setContexto}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">📁 Projeto (geral)</SelectItem>
            {tasks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                ↳ {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-[10px] text-muted-foreground">
          {isProjeto
            ? "Conversa geral do projeto."
            : `Comentários da tarefa "${tarefaSel?.title || "—"}".`}
        </p>

        {/* Uma instância por contexto — key força remount ao trocar */}
        <ComentariosSection
          key={contexto}
          entityType={isProjeto ? "project" : "task"}
          entityId={isProjeto ? projectId : contexto}
          profiles={profiles}
          compact
          vazio={
            isProjeto
              ? "Sem mensagens no projeto ainda. Use @nome para mencionar."
              : "Sem mensagens nesta tarefa ainda."
          }
        />
      </CardContent>
    </Card>
  );
}
