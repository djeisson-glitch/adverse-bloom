import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTION_STAGES_NEW } from "@/hooks/useProjects";
import { usePermissions } from "@/hooks/usePermissions";
import { ArrowLeft, Loader2, Plus, Trash2, Check, Clock, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

type Tab = "visao" | "tarefas" | "equipe" | "pos" | "entregaveis";

const TABS: { id: Tab; label: string }[] = [
  { id: "visao", label: "Visão geral" },
  { id: "tarefas", label: "Tarefas" },
  { id: "equipe", label: "Equipe" },
  { id: "pos", label: "Pós-Produção" },
  { id: "entregaveis", label: "Entregáveis" },
];

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canSeeMoney } = usePermissions();
  const [tab, setTab] = useState<Tab>("visao");

  const { data: project, isLoading } = useQuery({
    queryKey: ["projeto", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stage = PRODUCTION_STAGES_NEW.find((s) => s.id === project.status);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 py-6">
      <button
        onClick={() => navigate("/projetos")}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        voltar pra Projetos
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{project.numero || "—"}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {project.client_name || "—"} · {stage?.label || project.status}
          </p>
        </div>
        {canSeeMoney && (
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Valor vendido
            </p>
            <p className="text-2xl font-semibold text-primary">
              {formatCurrency(project.sold_value || 0)}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border/60">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "visao" && <VisaoGeral project={project} canSeeMoney={canSeeMoney} />}
      {tab === "tarefas" && <TarefasTab projectId={project.id} />}
      {tab === "equipe" && <EquipeTab project={project} />}
      {tab === "pos" && <PosTab project={project} canSeeMoney={canSeeMoney} />}
      {tab === "entregaveis" && <EntregaveisTab projectId={project.id} />}
    </div>
  );
}

/* --------------------------------------------------------- Visão geral */

function VisaoGeral({ project, canSeeMoney }: { project: any; canSeeMoney: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <Info label="Cliente" value={project.client_name || "—"} />
          <Info label="Início" value={project.start_date ? new Date(project.start_date).toLocaleDateString("pt-BR") : "—"} />
          <Info label="Entrega" value={project.delivery_date ? new Date(project.delivery_date).toLocaleDateString("pt-BR") : "—"} />
          <Info label="Etapa" value={PRODUCTION_STAGES_NEW.find((s) => s.id === project.status)?.label || project.status} />
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progresso</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
                <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress || 0}%` }} />
              </div>
              <span className="text-sm font-medium text-foreground">{project.progress || 0}%</span>
            </div>
          </div>
          {canSeeMoney && (
            <>
              <Info label="Vendido" value={formatCurrency(project.sold_value || 0)} />
              <Info label="Custos diretos" value={formatCurrency(project.direct_costs || 0)} />
              <Info
                label="Margem bruta"
                value={
                  <>
                    {formatCurrency(project.gross_margin_value || 0)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {(project.gross_margin_percent || 0).toFixed(1)}%
                    </span>
                  </>
                }
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

/* --------------------------------------------------------- Tarefas */

function TarefasTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [nova, setNova] = useState({ title: "", due_date: "", priority: "normal" });

  const { data: tasks = [] } = useQuery({
    queryKey: ["projeto-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("completed")
        .order("due_date", { nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!nova.title) throw new Error("Informe o título");
      const { error } = await (supabase as any).from("tasks").insert({
        project_id: projectId,
        title: nova.title,
        due_date: nova.due_date || null,
        priority: nova.priority,
        status: "backlog",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNova({ title: "", due_date: "", priority: "normal" });
      qc.invalidateQueries({ queryKey: ["projeto-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["projeto", projectId] });
      toast.success("Tarefa criada");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const toggle = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await (supabase as any)
        .from("tasks")
        .update({
          completed: !t.completed,
          completed_at: !t.completed ? new Date().toISOString() : null,
        })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projeto-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["projeto", projectId] });
    },
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projeto-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["projeto", projectId] });
    },
  });

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_140px_120px_100px]">
          <Input
            placeholder="Nova tarefa…"
            value={nova.title}
            onChange={(e) => setNova({ ...nova, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && criar.mutate()}
          />
          <Input
            type="date"
            value={nova.due_date}
            onChange={(e) => setNova({ ...nova, due_date: e.target.value })}
          />
          <Select value={nova.priority} onValueChange={(v) => setNova({ ...nova, priority: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="bg-primary text-primary-foreground">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhuma tarefa ainda.
            </div>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[24px_1fr_100px_100px_40px] items-center gap-3 border-b border-border/40 px-5 py-3 last:border-0"
              >
                <button
                  onClick={() => toggle.mutate(t)}
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    t.completed
                      ? "border-success bg-success/20 text-success"
                      : "border-border hover:border-primary"
                  }`}
                >
                  {t.completed && <Check className="h-3 w-3" />}
                </button>
                <span
                  className={`text-sm ${t.completed ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {t.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR") : "—"}
                </span>
                <span
                  className={`text-xs ${
                    t.priority === "alta"
                      ? "text-destructive"
                      : t.priority === "baixa"
                        ? "text-muted-foreground"
                        : "text-foreground"
                  }`}
                >
                  {t.priority}
                </span>
                <button
                  onClick={() => excluir.mutate(t.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- Equipe */

function EquipeTab({ project }: { project: any }) {
  return (
    <Card className="glass-card">
      <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
        Alocação de equipe vem na <span className="text-primary">Onda 4</span> junto com Horas e Timesheet.
        Por enquanto, use a{" "}
        <Link to="/agenda" className="text-primary hover:underline">
          Agenda existente
        </Link>{" "}
        pra montar diárias de captação.
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------- Pós-Produção */

function PosTab({ project, canSeeMoney }: { project: any; canSeeMoney: boolean }) {
  const qc = useQueryClient();
  const [horasVendidas, setHorasVendidas] = useState<string>(project.edicao_horas_vendidas?.toString() || "");
  const [horasMapeadas, setHorasMapeadas] = useState<string>(project.edicao_horas_mapeadas?.toString() || "");

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("projects")
        .update({
          edicao_horas_vendidas: horasVendidas ? Number(horasVendidas) : null,
          edicao_horas_mapeadas: horasMapeadas ? Number(horasMapeadas) : null,
        })
        .eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projeto", project.id] });
      toast.success("Salvo");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          Horas de edição vendidas × mapeadas × realizadas. Realizadas vêm na Onda 4 (das horas apontadas
          por quem tem papel <span className="text-primary">Edição</span>).
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Vendidas
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={horasVendidas}
                onChange={(e) => setHorasVendidas(e.target.value)}
                placeholder="0"
              />
              <span className="text-xs text-muted-foreground">h</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mapeadas
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={horasMapeadas}
                onChange={(e) => setHorasMapeadas(e.target.value)}
                placeholder="0"
              />
              <span className="text-xs text-muted-foreground">h</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Realizadas
            </p>
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">
              — <span className="text-xs">Onda 4</span>
            </p>
          </div>
        </div>
        <Button onClick={() => salvar.mutate()} className="bg-primary text-primary-foreground">
          Salvar horas de edição
        </Button>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------- Entregáveis */

function EntregaveisTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ titulo: "", data_entrega: "", arquivo_url: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["deliverables", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("*")
        .eq("project_id", projectId)
        .order("data_entrega", { nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!novo.titulo) throw new Error("Informe o título");
      const { error } = await (supabase as any).from("deliverables").insert({
        project_id: projectId,
        titulo: novo.titulo,
        data_entrega: novo.data_entrega || null,
        arquivo_url: novo.arquivo_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ titulo: "", data_entrega: "", arquivo_url: "" });
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

  const statusColor: Record<string, string> = {
    pendente: "bg-muted text-muted-foreground",
    em_revisao: "bg-warning/15 text-warning",
    aprovado: "bg-success/15 text-success",
    reprovado: "bg-destructive/15 text-destructive",
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1.5fr_140px_1.5fr_100px]">
          <Input
            placeholder="Título do entregável"
            value={novo.titulo}
            onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
          />
          <Input
            type="date"
            value={novo.data_entrega}
            onChange={(e) => setNovo({ ...novo, data_entrega: e.target.value })}
          />
          <Input
            placeholder="URL do arquivo (opcional)"
            value={novo.arquivo_url}
            onChange={(e) => setNovo({ ...novo, arquivo_url: e.target.value })}
          />
          <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="bg-primary text-primary-foreground">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum entregável ainda.
            </div>
          ) : (
            items.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-[1fr_140px_120px_60px_40px] items-center gap-3 border-b border-border/40 px-5 py-3 last:border-0"
              >
                <span className="text-sm font-medium text-foreground">{d.titulo}</span>
                <span className="text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {d.data_entrega ? new Date(d.data_entrega).toLocaleDateString("pt-BR") : "—"}
                </span>
                <span className={`rounded-md px-1.5 py-0.5 text-center text-[10px] font-medium ${statusColor[d.status] || ""}`}>
                  {d.status}
                </span>
                {d.arquivo_url ? (
                  <a href={d.arquivo_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span />
                )}
                <button onClick={() => excluir.mutate(d.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
