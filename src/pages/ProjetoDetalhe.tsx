import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimer } from "@/contexts/TimerContext";
import {
  ArrowLeft, Loader2, Play, Plus, Trash2, BarChart3, Send, Save, X,
  FileText, Link2, ExternalLink, MessageSquare, Rows3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { useLocalPref } from "@/hooks/useLocalPref";
import { agruparEntregaveis } from "@/lib/familiaEntregavel";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { MergulhoForm } from "@/components/MergulhoForm";

/**
 * Ficha de projeto no layout Catalunya OS (single-page) — modelado a partir
 * da exploração ao vivo do catalunyaos.com em 2026-07-02:
 * header c/ Horas por pessoa/tarefa (admin) · Apontar no projeto, tarefas
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

/** Formato técnico → palavra que se bate o olho. */
function formatoAmigavel(f?: string | null): string {
  const k = (f || "").toLowerCase().replace(/[:x]/g, "x").replace(/\s/g, "");
  if (k === "9x16") return "vertical";
  if (k === "16x9") return "horizontal";
  if (k === "1x1") return "quadrado";
  if (k === "4x5") return "retrato";
  return (f || "").trim();
}

/**
 * Resumo BEM enxuto das entregas, agrupado por duração + formato.
 * Ex.: [{label:"5× 15s vertical", n:5}, {label:"3× 90s horizontal", n:3}], total 8.
 */
function resumirEntregas(itens: { formato: string | null; duracao: string | null }[]) {
  const grupos = new Map<string, { n: number; dur: string; fmt: string }>();
  for (const it of itens) {
    const dur = (it.duracao || "").trim();
    const fmt = formatoAmigavel(it.formato);
    const chave = `${dur}|${fmt}`;
    const g = grupos.get(chave) || { n: 0, dur, fmt };
    g.n += 1;
    grupos.set(chave, g);
  }
  const linhas = [...grupos.values()]
    .sort((a, b) => b.n - a.n)
    .map((g) => ({
      n: g.n,
      label: `${g.n}× ${[g.dur, g.fmt].filter(Boolean).join(" ") || "vídeo"}`,
    }));
  return { total: itens.length, linhas };
}

type ProjetoTab = "entregaveis" | "tarefas" | "briefing" | "fechamento";

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canSeeMoney, canSeeHours, isAdmin } = usePermissions();
  const [tab, setTab] = useState<ProjetoTab>("entregaveis");
  // Contexto do painel de comentários (levantado pra cá pra o botão "conversa"
  // de cada entregável poder focar o painel sem sair da lista).
  const [comentContexto, setComentContexto] = useState<string>("project");

  const { data: project, isLoading } = useQuery({
    queryKey: ["projeto", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("projects_v").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["projeto-profiles"],
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

  // Resumo das entregas (formato × duração) — pra bater o olho no card de cima.
  const { data: entregasResumo = [] } = useQuery({
    queryKey: ["projeto-entregas-resumo", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("formato, duracao")
        .eq("project_id", id!);
      if (error) throw error;
      return data as { formato: string | null; duracao: string | null }[];
    },
  });
  const resumo = resumirEntregas(entregasResumo);

  const { data: horasProjeto } = useQuery({
    queryKey: ["projeto-horas-total", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_horas_projeto_total")
        .select("horas_total, horas_em_entregaveis")
        .eq("project_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
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
              {/* Horas por pessoa/tarefa é dado sensível (produtividade
                  individual): fica só pro admin. */}
              {isAdmin && (
                <Link to={`/relatorios/projeto/${project.id}`}>
                  <Button variant="outline" size="sm" title="Horas mapeadas por pessoa e por tarefa">
                    <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                    Horas por pessoa/tarefa
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                title="Excluir projeto"
                onClick={async () => {
                  if (!window.confirm("Excluir este projeto? Isso remove entregáveis, tarefas e apontamentos ligados a ele. Não dá pra desfazer.")) return;
                  const { error } = await (supabase as any).from("projects").delete().eq("id", project.id);
                  if (error) return toast.error("Não excluiu", { description: error.message });
                  toast.success("Projeto excluído");
                  navigate("/projetos");
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Excluir
              </Button>
            </div>
          </div>

          {/* flex-wrap em vez de grid fixo: quando o cartão de horas ou de
              valor some (coordenadora), o resto não fica com buraco. */}
          <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <HeaderInfo label="Cliente" value={project.client_name || "—"} />
            <HeaderInfo label="Status" value={project.status || "—"} />
            {canSeeMoney && (
              <HeaderInfo label="Valor" value={formatCurrency(project.sold_value || 0)} />
            )}
            {canSeeHours && (
              <HeaderInfo
                label="Horas rastreadas"
                value={`${Number(horasProjeto?.horas_total || 0).toFixed(1)}h`}
              />
            )}
            <FaturamentoProjeto
              projectId={project.id}
              valor={project.faturamento || "mensal"}
              podeEditar={canSeeMoney}
              onChanged={() => qc.invalidateQueries({ queryKey: ["projeto", id] })}
            />
          </div>

          {resumo.total > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entregas</span>
              {resumo.linhas.map((l) => (
                <span key={l.label} className="rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-foreground">
                  {l.label}
                </span>
              ))}
              <span className="text-xs text-muted-foreground">· {resumo.total} no total</span>
            </div>
          )}

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

          {tab === "entregaveis" && (
            <EntregaveisSection
              projectId={project.id}
              profiles={profiles}
              onAbrirConversa={(did) => setComentContexto(`deliverable:${did}`)}
            />
          )}

          {tab === "tarefas" && (
            <TarefasSection projectId={project.id} projectName={project.name} profiles={profiles} />
          )}

          {tab === "briefing" && (
            <>
              <BriefingProjetoSection project={project} onChanged={invalidate} />
              <MergulhoProjetoCard dealId={project.deal_id} />
              <DocumentosSection projectId={project.id} />
              <AprovacaoProjetoCard project={project} profiles={profiles} onChanged={invalidate} />
            </>
          )}

          {tab === "fechamento" && canSeeMoney && (
            <>
              <FechamentoSection project={project} onChanged={invalidate} />
              <FaturamentoSection project={project} />
            </>
          )}
        </div>

        {/* Painel de comentários sempre aberto — contexto por projeto/entregável/tarefa */}
        <ComentariosPainel
          projectId={project.id}
          projectName={project.name}
          profiles={profiles}
          contexto={comentContexto}
          setContexto={setComentContexto}
        />
      </div>
    </div>
  );
}

/**
 * Como ESTE projeto é faturado. "Mensal" entra no fechamento do mês do
 * cliente; "avulso" fica fora de toda a soma e é cobrado à parte — inclusive
 * as horas apontadas nele.
 *
 * Só quem enxerga dinheiro troca; o resto do time vê a marcação (precisa
 * saber que aquele job é cobrado separado), mas não mexe.
 */
function FaturamentoProjeto({
  projectId,
  valor,
  podeEditar,
  onChanged,
}: {
  projectId: string;
  valor: string;
  podeEditar: boolean;
  onChanged: () => void;
}) {
  const auto = useFormAutosave<Record<string, unknown>>(
    async (patch) => {
      const { error } = await (supabase as any).from("projects").update(patch).eq("id", projectId);
      if (error) {
        toast.error("Não salvou o faturamento", { description: error.message });
        throw error;
      }
      onChanged();
    },
    { delay: 150 },
  );
  const [v, setV] = useState(valor);

  if (!podeEditar) {
    return (
      <HeaderInfo
        label="Faturamento"
        value={valor === "avulso" ? "Avulso (à parte)" : "No fechamento do mês"}
      />
    );
  }

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Faturamento
        <IndicadorAutosave status={auto.status} />
      </p>
      <Select
        value={v}
        onValueChange={(nv) => {
          setV(nv);
          auto.agendar({ faturamento: nv });
        }}
      >
        <SelectTrigger className="mt-0.5 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mensal" className="text-xs">No fechamento do mês</SelectItem>
          <SelectItem value="avulso" className="text-xs">Avulso — faturo à parte</SelectItem>
        </SelectContent>
      </Select>
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

/* ------------------------------- Mergulho vindo do orçamento (read-only) */

function MergulhoProjetoCard({ dealId }: { dealId: string | null }) {
  const { data } = useQuery({
    queryKey: ["projeto-mergulho", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("deals").select("mergulho").eq("id", dealId).maybeSingle();
      if (error) throw error;
      return (data?.mergulho && typeof data.mergulho === "object" ? data.mergulho : {}) as Record<string, any>;
    },
  });
  const dados = data || {};
  const temResposta = Object.values(dados).some((v: any) => (v || "").toString().trim());
  if (!dealId || !temResposta) return null;
  return (
    <Card className="glass-card">
      <CardContent className="p-6">
        <h2 className="mb-1 text-base font-semibold text-foreground">Mergulho / Briefing estratégico</h2>
        <p className="mb-4 text-xs text-muted-foreground">Respondido na fase do orçamento — carregado pra cá pra não se perder.</p>
        <MergulhoForm value={dados} readOnly />
      </CardContent>
    </Card>
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

  // Salva ao digitar: manda só o campo mexido, ~0,8s depois da última tecla.
  const auto = useFormAutosave<Record<string, string>>(async (patch) => {
    const { error } = await (supabase as any).from("projects").update(patch).eq("id", project.id);
    if (error) {
      toast.error("Não salvou o briefing", { description: error.message });
      throw error;
    }
    onChanged();
  });

  const set = (key: string, valor: string) => {
    setForm((f) => ({ ...f, [key]: valor }));
    auto.agendar({ [key]: valor });
  };

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
          <IndicadorAutosave status={auto.status} />
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
                onChange={(e) => set(c.key, e.target.value)}
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

/* ------------------------------- Override de aprovação por projeto (6D) */

function AprovacaoProjetoCard({
  project, profiles, onChanged,
}: {
  project: any;
  profiles: any[];
  onChanged: () => void;
}) {
  const [n1, setN1] = useState<string>(project.aprovador_n1_id || "__herdar__");
  const [n2, setN2] = useState<string>(project.aprovador_n2_id || "__herdar__");
  const [cli, setCli] = useState<string>(
    project.cliente_aprova === null || project.cliente_aprova === undefined
      ? "__herdar__"
      : project.cliente_aprova
        ? "sim"
        : "nao",
  );

  // Escolha em select salva na hora — não tem o que esperar de digitação.
  const auto = useFormAutosave<Record<string, unknown>>(
    async (patch) => {
      const { error } = await (supabase as any)
        .from("projects")
        .update(patch)
        .eq("id", project.id);
      if (error) {
        toast.error("Não salvou a aprovação", { description: error.message });
        throw error;
      }
      onChanged();
    },
    { delay: 150 },
  );

  const herdar = (v: string) => (v === "__herdar__" ? null : v);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-6">
        <div>
          <p className="text-sm font-semibold text-foreground">Aprovação deste projeto</p>
          <p className="text-xs text-muted-foreground">
            Sobrescreve os aprovadores padrão só neste projeto. "Herdar do global" usa o que está em
            Admin → Aprovações.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Nível 1</Label>
            <Select
              value={n1}
              onValueChange={(v) => {
                setN1(v);
                auto.agendar({ aprovador_n1_id: herdar(v) });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__herdar__">Herdar do global</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nível 2</Label>
            <Select
              value={n2}
              onValueChange={(v) => {
                setN2(v);
                auto.agendar({ aprovador_n2_id: herdar(v) });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__herdar__">Herdar do global</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cliente aprova?</Label>
            <Select
              value={cli}
              onValueChange={(v) => {
                setCli(v);
                auto.agendar({ cliente_aprova: v === "__herdar__" ? null : v === "sim" });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__herdar__">Herdar do global</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não (só visualiza)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <IndicadorAutosave status={auto.status} />
        </div>
      </CardContent>
    </Card>
  );
}

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
        .is("deliverable_id", null)   // docs do projeto; os de entregável vivem na peça
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

/** Uma linha da tabela de entregáveis. Virou componente porque agora ela é
 *  renderizada solta OU dentro de um grupo de semelhança. */
/** Uma linha da tabela de entregáveis. Virou componente porque agora ela é
 *  renderizada solta OU dentro de um grupo de semelhança. */
function LinhaEntregavel({
  d,
  projectId,
  nomeDe,
  navigate,
  onAbrirConversa,
  onExcluir,
}: {
  d: any;
  projectId: string;
  nomeDe: (id: string | null) => string;
  navigate: (to: string) => void;
  onAbrirConversa: (id: string) => void;
  onExcluir: (id: string) => void;
}) {
  return (
    <div
      onClick={() => navigate(`/projetos/${projectId}/entregaveis/${d.id}`)}
      className="grid min-w-[680px] cursor-pointer grid-cols-[minmax(180px,1.6fr)_56px_56px_96px_88px_96px_84px] items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-sm hover:border-primary/40 hover:bg-sidebar-accent/40"
    >
      <span className="line-clamp-2 break-words font-medium leading-tight text-foreground" title={d.titulo}>
        {d.titulo}
      </span>
      <span className="text-xs text-muted-foreground">{d.formato || "—"}</span>
      <span className="text-xs text-muted-foreground">{d.duracao || "—"}</span>
      <span className="truncate text-xs text-muted-foreground">{nomeDe(d.responsavel_id)}</span>
      {/* Prazo INTERNO (cai pro prazo do cliente só se o interno estiver vazio).
          formatDate evita o desvio de fuso que fazia aparecer 1 dia a menos. */}
      <span
        className="text-xs text-muted-foreground"
        title={d.prazo_interno ? "Prazo interno" : d.data_entrega ? "Sem prazo interno — mostrando o prazo do cliente" : ""}
      >
        {formatDate(d.prazo_interno || d.data_entrega || null)}
      </span>
      {/* Status em português — "em_edicao" cru não diz nada pra quem olha rápido */}
      <span
        className="truncate rounded bg-muted/60 px-1.5 py-0.5 text-center text-[10px] text-muted-foreground"
        title={rotuloStatus(d.status)}
      >
        {rotuloStatus(d.status)}
      </span>
      {/* Ações rápidas — Frame, conversa e excluir deste entregável.
          A lixeira mora aqui (e não em coluna própria) pra linha não estourar a largura do card. */}
      <span className="flex items-center justify-end gap-1">
        {d.arquivo_url ? (
          <a
            href={d.arquivo_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir no Frame.io"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-primary hover:bg-primary/10"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/projetos/${projectId}/entregaveis/${d.id}`); }}
            title="Sem link do Frame — adicione dentro do entregável"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border/40 text-muted-foreground/40 hover:text-muted-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAbrirConversa(d.id); }}
          title="Abrir a conversa deste entregável"
          className="flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:text-primary hover:bg-primary/10"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onExcluir(d.id); }}
          title="Excluir entregável"
          className="flex h-6 w-6 items-center justify-center rounded-md border border-border/40 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

// Cor por grupo de semelhança — o que separa visualmente um bloco do outro.
// Fica na ordem em que os grupos aparecem (maior primeiro), então o olho
// aprende o padrão. "Avulsos" é sempre neutro: não é uma família, é o resto.
const CORES_GRUPO = [
  { borda: "border-l-primary", chip: "bg-primary/15 text-primary" },
  { borda: "border-l-blue-500", chip: "bg-blue-500/15 text-blue-500" },
  { borda: "border-l-emerald-500", chip: "bg-emerald-500/15 text-emerald-500" },
  { borda: "border-l-purple-500", chip: "bg-purple-500/15 text-purple-500" },
  { borda: "border-l-amber-500", chip: "bg-amber-500/15 text-amber-500" },
  { borda: "border-l-cyan-500", chip: "bg-cyan-500/15 text-cyan-500" },
] as const;

const COR_AVULSOS = {
  borda: "border-l-border",
  chip: "bg-muted/60 text-muted-foreground",
} as const;

function corDoGrupo(chave: string, indice: number) {
  if (chave === "__avulsos__") return COR_AVULSOS;
  return CORES_GRUPO[indice % CORES_GRUPO.length];
}

// Status do entregável em português. O valor cru do banco ("em_edicao",
// "ajuste_solicitado") não diz nada pra quem bate o olho na lista.
const STATUS_ENTREGAVEL_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_edicao: "Em edição",
  revisao_n1: "Revisão N1",
  revisao_n2: "Revisão N2",
  revisao: "Revisão",
  pronto: "Pronto",
  com_cliente: "Com o cliente",
  ajuste_solicitado: "Ajuste pedido",
  aprovado: "Aprovado",
  entregue: "Entregue",
};

function rotuloStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_ENTREGAVEL_LABEL[status] || status.replace(/_/g, " ");
}

function EntregaveisSection({ projectId, profiles, onAbrirConversa }: { projectId: string; profiles: any[]; onAbrirConversa: (deliverableId: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [agrupar, setAgrupar] = useLocalPref<"sim" | "nao">("entregaveis:agrupar", "sim", ["sim", "nao"]);
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

  // Junta o que é parecido (formato/duração quando preenchidos; senão, o nome).
  // Devolve null quando agrupar não ajudaria — aí a lista sai reta, como antes.
  const grupos = useMemo(
    () => (agrupar === "nao" ? null : agruparEntregaveis(items)),
    [items, agrupar],
  );

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
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Entregáveis
          </p>
          {/* Só oferece desligar quando o agrupamento de fato apareceu. */}
          {(grupos || agrupar === "nao") && items.length >= 3 && (
            <button
              onClick={() => setAgrupar(agrupar === "sim" ? "nao" : "sim")}
              title={agrupar === "sim" ? "Ver como lista corrida" : "Juntar os parecidos"}
              className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Rows3 className="h-3 w-3" />
              {agrupar === "sim" ? "Agrupado" : "Lista corrida"}
            </button>
          )}
        </div>

        {/* Rola na horizontal quando a tela aperta — antes a linha vazava e a
            lixeira ficava pra fora do card. */}
        <div className="-mx-1 space-y-4 overflow-x-auto px-1 pb-1">
        {items.length > 0 && (
          <div className="grid min-w-[680px] grid-cols-[minmax(180px,1.6fr)_56px_56px_96px_88px_96px_84px] gap-2 px-3 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Entregável</span>
            <span>Formato</span>
            <span>Duração</span>
            <span>Responsável</span>
            <span>Prazo interno</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
        )}
        {grupos
          ? grupos.map((g, i) => {
              const cor = corDoGrupo(g.chave, i);
              return (
                <div
                  key={g.chave}
                  className={`min-w-[680px] space-y-1.5 border-l-[3px] py-1 pl-3 ${cor.borda}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cor.chip}`}
                    >
                      {g.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.itens.length} {g.itens.length === 1 ? "item" : "itens"}
                    </span>
                  </div>
                  {g.itens.map((d: any) => (
                    <LinhaEntregavel
                      key={d.id}
                      d={d}
                      projectId={projectId}
                      nomeDe={nomeDe}
                      navigate={navigate}
                      onAbrirConversa={onAbrirConversa}
                      onExcluir={(id) => excluir.mutate(id)}
                    />
                  ))}
                </div>
              );
            })
          : items.map((d) => (
              <LinhaEntregavel
                key={d.id}
                d={d}
                projectId={projectId}
                nomeDe={nomeDe}
                navigate={navigate}
                onAbrirConversa={onAbrirConversa}
                onExcluir={(id) => excluir.mutate(id)}
              />
            ))}
        </div>

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
          </div>
          <p className="text-[11px] text-muted-foreground">
            O link do Frame.io fica <b>dentro do entregável</b> — abra-o pelo botão <ExternalLink className="inline h-3 w-3" /> da linha pra adicionar ou editar.
          </p>
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
        .select("*, profile:profiles(id, full_name, email)")
        .eq("project_id", project.id);
      if (error) throw error;

      const { data: custos } = await (supabase as any)
        .from("profiles_custo")
        .select("user_id, custo_hora");   // RLS: vem vazio pra quem não vê dinheiro
      const porPessoa = new Map((custos || []).map((c: any) => [c.user_id, c.custo_hora]));
      return (data || []).map((m: any) => ({
        ...m,
        profile: m.profile ? { ...m.profile, custo_hora: porPessoa.get(m.user_id) ?? null } : m.profile,
      })) as any[];
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

  // Dinheiro continua passando pela RPC, que checa o papel de quem edita.
  const autoFallback = useFormAutosave<{ custo_hora_padrao: string }>(async (patch) => {
    const v = patch.custo_hora_padrao ?? "";
    const { error } = await (supabase as any).rpc("set_projeto_financeiro", {
      _project_id: project.id,
      _custo_hora_padrao: v ? Number(v) : null,
    });
    if (error) {
      toast.error("Não salvou o custo/hora", { description: error.message });
      throw error;
    }
    invalidateAll();
  });

  const salvarCustoHoraPessoa = async (userId: string, valor: string) => {
    const { error } = await (supabase as any).rpc("set_custo_hora", {
      _user_id: userId,
      _valor: valor ? Number(valor) : null,
    });
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
              onChange={(e) => {
                setFallback(e.target.value);
                autoFallback.agendar({ custo_hora_padrao: e.target.value });
              }}
              className="h-8 w-28 text-xs"
            />
            <IndicadorAutosave status={autoFallback.status} />
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
  entityType, entityId, profiles, titulo = "Comentários", vazio, compact, fill,
}: {
  entityType: CommentEntity;
  entityId: string;
  profiles: any[];
  titulo?: string;
  vazio?: string;
  compact?: boolean;
  fill?: boolean;   // preenche a altura do container (painel lateral) — msgs rolam, input fixo embaixo
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");

  // comments.user_id referencia auth.users (não profiles), então o autor é
  // resolvido pela lista de profiles — o embed PostgREST author:profiles não
  // existe e quebrava a leitura (histórico vinha vazio).
  const autores = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const autorDe = (uid: string) => {
    const a = autores.get(uid);
    return a?.full_name || a?.email || "?";
  };

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comments")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
    // Sem isto, mensagem de outra pessoa só aparecia ao recarregar.
    refetchInterval: 7000,
    refetchOnWindowFocus: true,
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

  // No modo fill, as mensagens crescem e rolam e o input fica preso embaixo.
  const corpoCls = fill
    ? "space-y-3 min-h-0 flex-1 overflow-y-auto pr-1"
    : compact
    ? "space-y-3 max-h-[45vh] overflow-y-auto pr-1"
    : "space-y-3";

  const lista = (
    <>
      {comments.length === 0 ? (
        <p className={`text-xs text-muted-foreground ${fill ? "flex-1" : ""}`}>
          {vazio || "Nenhum comentário ainda. Use @nome para mencionar alguém."}
        </p>
      ) : (
        <div className={corpoCls}>
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
                  {autorDe(c.user_id).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {autorDe(c.user_id)}
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

  // Modo preencher: ocupa a altura toda do container (painel lateral).
  if (fill) return <div className="flex h-full flex-col gap-3">{lista}</div>;

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
  projectId, projectName, profiles, contexto, setContexto,
}: {
  projectId: string;
  projectName: string;
  profiles: any[];
  contexto: string;
  setContexto: (v: string) => void;
}) {
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

  const { data: entregaveis = [] } = useQuery({
    queryKey: ["projeto-entregaveis-coment", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo")
        .eq("project_id", projectId)
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  // contexto: "project" (geral) | "deliverable:<id>" | "<task id>"
  const isProjeto = contexto === "project";
  const isEntregavel = contexto.startsWith("deliverable:");
  const entregavelId = isEntregavel ? contexto.slice("deliverable:".length) : null;
  const tarefaSel = tasks.find((t) => t.id === contexto);
  const entregavelSel = entregaveis.find((e) => e.id === entregavelId);

  const entityType: CommentEntity = isProjeto ? "project" : isEntregavel ? "deliverable" : "task";
  const entityId = isProjeto ? projectId : isEntregavel ? entregavelId! : contexto;

  return (
    <Card className="glass-card lg:sticky lg:top-20">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Comentários</p>
        </div>

        {/* Seletor de contexto — separa a conversa do projeto, de cada entregável e de cada tarefa */}
        <Select value={contexto} onValueChange={setContexto}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">📁 Projeto (geral)</SelectItem>
            {entregaveis.map((e) => (
              <SelectItem key={e.id} value={`deliverable:${e.id}`}>
                🎬 {e.titulo}
              </SelectItem>
            ))}
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
            : isEntregavel
              ? `Conversa do entregável "${entregavelSel?.titulo || "—"}".`
              : `Comentários da tarefa "${tarefaSel?.title || "—"}".`}
        </p>

        {/* Uma instância por contexto — key força remount ao trocar */}
        <ComentariosSection
          key={contexto}
          entityType={entityType}
          entityId={entityId}
          profiles={profiles}
          compact
          vazio={
            isProjeto
              ? "Sem mensagens no projeto ainda. Use @nome para mencionar."
              : isEntregavel
                ? "Sem mensagens neste entregável ainda. Use @nome para mencionar."
                : "Sem mensagens nesta tarefa ainda."
          }
        />
      </CardContent>
    </Card>
  );
}
