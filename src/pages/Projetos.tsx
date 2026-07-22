import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects, useUpdateProject, PRODUCTION_STAGES_NEW, type Project } from "@/hooks/useProjects";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocalPref } from "@/hooks/useLocalPref";
import { LayoutGrid, Plus, Loader2, ArrowUpDown, Rows3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductionKanban } from "@/components/producao/ProductionKanban";
import { formatCurrency, formatDate } from "@/lib/format";
import { NewProjectModal } from "@/components/producao/NewProjectModal";

/** Etapas que tiram o projeto de "em andamento" e mandam pra aba Finalizados. */
const STATUS_FINALIZADO = ["entregue", "faturado"];

type Vista = "lista" | "board" | "calendario" | "gantt" | "finalizados";
type Ordem = "recentes" | "nome" | "prazo";
type Agrupar = "etapa" | "cliente" | "nenhum";

const VISTAS: { id: Vista; label: string }[] = [
  { id: "lista", label: "Lista" },
  { id: "board", label: "Board" },
  { id: "calendario", label: "Calendário" },
  { id: "gantt", label: "Gantt" },
  { id: "finalizados", label: "Finalizados" },
];

const VISTA_IDS = VISTAS.map((v) => v.id);
const ORDENS: { id: Ordem; label: string }[] = [
  { id: "recentes", label: "Mais recentes" },
  { id: "nome", label: "Nome (A–Z)" },
  { id: "prazo", label: "Data de vencimento" },
];
const AGRUPAMENTOS: { id: Agrupar; label: string }[] = [
  { id: "etapa", label: "Etapa" },
  { id: "cliente", label: "Cliente" },
  { id: "nenhum", label: "Não agrupar" },
];

export default function Projetos() {
  const { data: projects = [], isLoading } = useProjects();
  const { canSeeMoney } = usePermissions();
  const navigate = useNavigate();
  // Board é a visão padrão — é ela que mostra o andamento da produção de
  // relance. A última escolha sobrescreve e fica salva: quem prefere lista
  // volta pra lista.
  const [vista, setVista] = useLocalPref<Vista>("projetos:vista", "board", VISTA_IDS);
  const [ordem, setOrdem] = useLocalPref<Ordem>("projetos:ordem", "recentes", [
    "recentes",
    "nome",
    "prazo",
  ]);
  const [agrupar, setAgrupar] = useLocalPref<Agrupar>("projetos:agrupar", "etapa", [
    "etapa",
    "cliente",
    "nenhum",
  ]);
  const [openNew, setOpenNew] = useState(false);

  // Projeto ENTREGUE já saiu da produção — junto com o faturado, vai pra aba
  // Finalizados. Antes só "faturado" saía, e a lista de "em andamento" carregava
  // tudo que já tinha sido entregue (ficavam ~190 itens e o que estava rodando
  // de verdade se perdia no meio).
  const emAndamento = useMemo(
    () => projects.filter((p) => !STATUS_FINALIZADO.includes(p.status || "")),
    [projects],
  );
  const finalizados = useMemo(
    () => projects.filter((p) => STATUS_FINALIZADO.includes(p.status || "")),
    [projects],
  );

  const base = vista === "finalizados" ? finalizados : emAndamento;

  const lista = useMemo(() => {
    const arr = [...base];
    if (ordem === "nome") {
      arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
    } else if (ordem === "prazo") {
      // Sem prazo vai pro fim — senão os vazios enterram o que está vencendo.
      arr.sort((a, b) => {
        if (!a.delivery_date && !b.delivery_date) return 0;
        if (!a.delivery_date) return 1;
        if (!b.delivery_date) return -1;
        return a.delivery_date.localeCompare(b.delivery_date);
      });
    } else {
      arr.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    }
    return arr;
  }, [base, ordem]);

  // Agrupar só faz sentido na tabela — o board já agrupa por coluna.
  const mostraLista = vista === "lista" || vista === "finalizados";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {vista === "finalizados" ? "Projetos finalizados" : "Projetos em andamento"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {lista.length} projetos · Produção (PT)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                title={`${v.label} — sua escolha fica salva como visão padrão`}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  vista === v.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
            <SelectTrigger className="h-8 w-[178px] text-xs" title="Ordenar projetos">
              <ArrowUpDown className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDENS.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mostraLista && (
            <Select value={agrupar} onValueChange={(v) => setAgrupar(v as Agrupar)}>
              <SelectTrigger className="h-8 w-[150px] text-xs" title="Agrupar projetos">
                <Rows3 className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGRUPAMENTOS.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            size="sm"
            className="bg-primary text-primary-foreground"
            onClick={() => setOpenNew(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo projeto
          </Button>
        </div>
      </div>

      {vista === "board" && <BoardVista projects={lista} onOpen={(id) => navigate(`/projetos/${id}`)} />}
      {mostraLista && (
        <ListaVista
          projects={lista}
          canSeeMoney={canSeeMoney}
          agrupar={agrupar}
          onOpen={(id) => navigate(`/projetos/${id}`)}
        />
      )}
      {vista === "calendario" && <CalendarioVista projects={lista} />}
      {vista === "gantt" && <GanttVista projects={lista} />}

      <NewProjectModal open={openNew} onOpenChange={setOpenNew} />
    </div>
  );
}

/* --------------------------------------------------------- Lista Catalunya */

function ListaVista({
  projects,
  canSeeMoney,
  agrupar,
  onOpen,
}: {
  projects: Project[];
  canSeeMoney: boolean;
  agrupar: Agrupar;
  onOpen: (id: string) => void;
}) {
  // Agrupa por etapa ou por cliente (ou não agrupa). A ordem escolhida lá em cima
  // é preservada dentro de cada grupo, porque o Map mantém a ordem de inserção.
  const grupos = useMemo<[string, Project[]][]>(() => {
    if (agrupar === "nenhum") return [["", projects]];

    const map = new Map<string, Project[]>();
    projects.forEach((p) => {
      const chave =
        agrupar === "cliente" ? p.client_name || "Sem cliente" : p.status || "briefing";
      map.set(chave, [...(map.get(chave) || []), p]);
    });
    const entradas = Array.from(map.entries());

    if (agrupar === "cliente") {
      // "Sem cliente" por último — é pendência de cadastro, não um cliente.
      return entradas.sort((a, b) => {
        if (a[0] === "Sem cliente") return 1;
        if (b[0] === "Sem cliente") return -1;
        return a[0].localeCompare(b[0], "pt-BR");
      });
    }
    return entradas.sort((a, b) => {
      const ia = PRODUCTION_STAGES_NEW.findIndex((s) => s.id === a[0]);
      const ib = PRODUCTION_STAGES_NEW.findIndex((s) => s.id === b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [projects, agrupar]);

  if (projects.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhum projeto ainda. Ganhe um orçamento e transforme-o em projeto.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <div className="grid grid-cols-[80px_1fr_120px_100px_140px_120px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Job</span>
          <span>Projeto</span>
          <span>Progresso</span>
          <span>Equipe</span>
          <span>Prazo</span>
          <span className="text-right">Valor</span>
        </div>
        {grupos.map(([chave, items]) => {
          const stage =
            agrupar === "etapa" ? PRODUCTION_STAGES_NEW.find((s) => s.id === chave) : undefined;
          return (
            <div key={chave || "todos"}>
              {agrupar !== "nenhum" && (
                <div className="flex items-center gap-2 bg-muted/20 px-5 py-2 text-xs">
                  {agrupar === "etapa" && (
                    <span className={`h-2 w-2 rounded-full border ${stage?.color || ""}`} />
                  )}
                  <span className="font-medium text-foreground">{stage?.label || chave}</span>
                  <span className="text-muted-foreground">{items.length}</span>
                </div>
              )}
              {items.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  className="grid cursor-pointer grid-cols-[80px_1fr_120px_100px_140px_120px] items-center gap-2 border-b border-border/40 px-5 py-3 last:border-0 hover:bg-sidebar-accent/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">{(p as any).numero || "—"}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-foreground" title={p.name}>
                        {p.name}
                      </p>
                      {/* Avulso é a exceção: só ele ganha marca, pra não poluir
                          a lista com um selo em cada linha. */}
                      {(p as any).faturamento === "avulso" && (
                        <span
                          className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-500"
                          title="Fora do fechamento mensal — faturado à parte"
                        >
                          avulso
                        </span>
                      )}
                    </div>
                    {/* Agrupado por cliente, repetir o cliente na linha é ruído:
                        mostra a etapa, que é a informação que falta ali. */}
                    <p className="truncate text-xs text-muted-foreground">
                      {agrupar === "cliente"
                        ? PRODUCTION_STAGES_NEW.find((s) => s.id === p.status)?.label ||
                          p.status ||
                          "—"
                        : p.client_name || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(p as any).progress ?? 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{(p as any).progress ?? 0}%</span>
                  </div>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(p.delivery_date)}
                  </span>
                  <span className="text-right text-sm text-foreground">
                    {canSeeMoney ? formatCurrency(p.sold_value || 0) : "—"}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------- Board (Kanban) */

function BoardVista({ projects }: { projects: Project[]; onOpen?: (id: string) => void }) {
  const updateProject = useUpdateProject();
  // O card do Kanban navega sozinho pra ficha no clique (e arrasta pra mover).
  // O wrapper antigo procurava [data-project-id], atributo que nunca existiu.
  return (
    <ProductionKanban
      projects={projects as any}
      onMoveProject={(id, status) => updateProject.mutate({ id, status })}
    />
  );
}

/* ------------------------------------------------------- Calendário simples */

function CalendarioVista({ projects }: { projects: Project[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const iso = (d: number) => new Date(y, m, d).toISOString().slice(0, 10);
  const byDate = new Map<string, Project[]>();
  projects.forEach((p) => {
    if (p.delivery_date) {
      const key = p.delivery_date.slice(0, 10);
      byDate.set(key, [...(byDate.get(key) || []), p]);
    }
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium capitalize text-foreground">
            {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date(y, m - 1, 1))}>
              ◄
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
              Hoje
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date(y, m + 1, 1))}>
              ►
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
            <div key={d} className="px-2 py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d == null) return <div key={i} className="h-24 rounded-md" />;
            const key = iso(d);
            const dayProjects = byDate.get(key) || [];
            const isToday = key === today;
            return (
              <div
                key={i}
                className={`flex h-24 flex-col justify-between rounded-md border p-1.5 text-xs ${
                  isToday ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/10"
                }`}
              >
                <span className={isToday ? "text-primary" : "text-muted-foreground"}>{d}</span>
                <div className="space-y-0.5">
                  {dayProjects.slice(0, 2).map((p) => (
                    <span key={p.id} className="block truncate rounded bg-destructive/15 px-1 py-0.5 text-[9px] text-destructive">
                      🎯 {p.name}
                    </span>
                  ))}
                  {dayProjects.length > 2 && (
                    <span className="text-[9px] text-muted-foreground">+{dayProjects.length - 2}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------- Gantt (barras) */

function GanttVista({ projects }: { projects: Project[] }) {
  const withDates = projects.filter((p) => (p.sold_date || (p as any).start_date) && p.delivery_date);

  if (withDates.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhum projeto com data de início e prazo definidos. Preencha na ficha do projeto.
        </CardContent>
      </Card>
    );
  }

  const starts = withDates.map((p) => new Date(((p as any).start_date || p.sold_date) as string).getTime());
  const ends = withDates.map((p) => new Date(p.delivery_date!).getTime());
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const range = Math.max(max - min, 1);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-2 p-5">
        {withDates.map((p) => {
          const start = new Date(((p as any).start_date || p.sold_date) as string).getTime();
          const end = new Date(p.delivery_date!).getTime();
          const left = ((start - min) / range) * 100;
          const width = ((end - start) / range) * 100;
          return (
            <div key={p.id} className="flex items-center gap-3">
              <span className="w-48 truncate text-xs text-foreground">{p.name}</span>
              <div className="relative h-6 flex-1 rounded-md bg-muted/40">
                <div
                  className="absolute inset-y-0 rounded-md bg-primary/70"
                  style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                  title={`${new Date(start).toLocaleDateString("pt-BR")} → ${new Date(end).toLocaleDateString("pt-BR")}`}
                />
              </div>
              <span className="w-24 text-right text-[10px] text-muted-foreground">
                {new Date(end).toLocaleDateString("pt-BR")}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
