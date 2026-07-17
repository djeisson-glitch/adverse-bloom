import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Link } from "react-router-dom";
import {
  Clapperboard, Film, ThumbsUp, ChevronRight, Loader2, ListChecks,
  RefreshCw, Inbox, AlertTriangle, Clock, CalendarDays, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Minha mesa": o ÚNICO lugar onde a pessoa vê, em ordem de prioridade, tudo
 * que precisa dela — sem aba escondendo nada. Junta: entregáveis pra editar,
 * aprovações esperando você, alterações do cliente, tarefas e (pra quem
 * coordena) demandas novas. Ordem: Atrasado → Precisa de você → Esta semana →
 * Em andamento. O que está atrasado ou travando alguém aparece em destaque.
 */

type Tipo = "editar" | "aprovar" | "alteracao" | "tarefa" | "demanda";
type Bucket = "atrasado" | "espera" | "semana" | "andamento";

type Item = {
  key: string;
  tipo: Tipo;
  titulo: string;
  contexto: string;
  acao: string;
  link: string;
  due: string | null;      // YYYY-MM-DD
  bloqueante: boolean;      // está travando alguém (aprovação, alteração, demanda, ajuste do cliente)
};

const TIPO_ICON: Record<Tipo, any> = {
  editar: Film,
  aprovar: ThumbsUp,
  alteracao: RefreshCw,
  tarefa: ListChecks,
  demanda: Inbox,
};
const TIPO_COR: Record<Tipo, string> = {
  editar: "text-primary",
  aprovar: "text-emerald-400",
  alteracao: "text-amber-400",
  tarefa: "text-blue-400",
  demanda: "text-purple-400",
};

const SECOES: { id: Bucket; label: string; hint: string; icon: any; cor: string; dot: string }[] = [
  { id: "atrasado",  label: "Atrasado",        hint: "passou do prazo — resolve primeiro", icon: AlertTriangle, cor: "text-destructive", dot: "bg-destructive" },
  { id: "espera",    label: "Precisa de você", hint: "está travando alguém",               icon: Clock,         cor: "text-amber-400",   dot: "bg-amber-400" },
  { id: "semana",    label: "Esta semana",     hint: "prazo nos próximos 7 dias",          icon: CalendarDays,  cor: "text-blue-400",    dot: "bg-blue-400" },
  { id: "andamento", label: "Em andamento",    hint: "seu trabalho aberto",                icon: ListChecks,    cor: "text-muted-foreground", dot: "bg-muted-foreground" },
];

function iso(d: Date) { return d.toISOString().slice(0, 10); }

export default function MinhaMesa() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const hoje = iso(new Date());
  const em7 = iso(new Date(Date.now() + 7 * 86400000));
  const podeDemandas = can("demandas");

  const { data: settings } = useQuery({
    queryKey: ["approval-settings"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("approval_settings").select("*").eq("id", true).maybeSingle();
      return data as any;
    },
  });

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ["minha-mesa-deliverables"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status, formato, data_entrega, responsavel_id, aprovado_n1_em, aprovado_n2_em, project:projects(id, numero, name, aprovador_n1_id, aprovador_n2_id)")
        .order("data_entrega", { nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: tarefas = [] } = useQuery({
    queryKey: ["minha-mesa-tarefas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tasks")
        .select("id, title, due_date, project:projects(id, name)")
        .eq("assigned_user_id", user!.id)
        .eq("completed", false);
      return (data as any[]) || [];
    },
  });

  const { data: alteracoes = [] } = useQuery({
    queryKey: ["minha-mesa-alteracoes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("deliverable_alteracoes")
        .select("id, titulo, status, prazo, responsavel_id, deliverable:deliverables(id, titulo, responsavel_id, data_entrega, project:projects(id, name, numero))")
        .eq("status", "aberta");
      return (data as any[]) || [];
    },
  });

  const { data: demandas = [] } = useQuery({
    queryKey: ["minha-mesa-demandas"],
    enabled: podeDemandas,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("demandas")
        .select("id, nome_projeto, solicitante_nome, prazo_desejado, client:clients(name)")
        .eq("status", "nova");
      return (data as any[]) || [];
    },
  });

  const itens = useMemo<Item[]>(() => {
    if (!user?.id) return [];
    const out: Item[] = [];

    // 1. Entregáveis meus pra editar
    deliverables
      .filter((d) => d.responsavel_id === user.id && ["pendente", "em_edicao", "ajuste_solicitado"].includes(d.status))
      .forEach((d) => {
        const ajuste = d.status === "ajuste_solicitado";
        out.push({
          key: `edit-${d.id}`,
          tipo: "editar",
          titulo: d.titulo,
          contexto: `${d.project?.numero || ""} · ${d.project?.name || ""}`,
          acao: ajuste ? "Refazer — ajuste do cliente" : d.status === "pendente" ? "Começar edição" : "Continuar edição",
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
          due: d.data_entrega || null,
          bloqueante: ajuste,
        });
      });

    // 2. Entregáveis esperando MINHA aprovação (resolve override por projeto)
    deliverables.forEach((d) => {
      const effN1 = d.project?.aprovador_n1_id ?? settings?.nivel1_user_id ?? null;
      const effN2 = d.project?.aprovador_n2_id ?? settings?.nivel2_user_id ?? null;
      const souN1 = effN1 === user.id && d.status === "revisao_n1" && !d.aprovado_n1_em;
      const souN2 = effN2 === user.id && d.status === "revisao_n2" && d.aprovado_n1_em && !d.aprovado_n2_em;
      if (souN1 || souN2) {
        out.push({
          key: `aprov-${d.id}`,
          tipo: "aprovar",
          titulo: d.titulo,
          contexto: `${d.project?.numero || ""} · ${d.project?.name || ""}`,
          acao: souN1 ? "Aprovar N1" : "Aprovar N2",
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
          due: d.data_entrega || null,
          bloqueante: true,
        });
      }
    });

    // 3. Alterações do cliente abertas que são minhas
    alteracoes
      .filter((a) => a.responsavel_id === user.id || a.deliverable?.responsavel_id === user.id)
      .forEach((a) => {
        out.push({
          key: `alt-${a.id}`,
          tipo: "alteracao",
          titulo: `${a.titulo} — ${a.deliverable?.titulo || "entregável"}`,
          contexto: `${a.deliverable?.project?.numero || ""} · ${a.deliverable?.project?.name || ""}`,
          acao: "Responder alteração do cliente",
          link: a.deliverable?.id ? `/projetos/${a.deliverable?.project?.id}/entregaveis/${a.deliverable.id}` : "#",
          due: a.prazo || a.deliverable?.data_entrega || null,
          bloqueante: true,
        });
      });

    // 4. Minhas tarefas
    tarefas.forEach((t) => {
      out.push({
        key: `task-${t.id}`,
        tipo: "tarefa",
        titulo: t.title,
        contexto: t.project?.name || "Tarefa",
        acao: "Fazer tarefa",
        link: t.project?.id ? `/projetos/${t.project.id}` : "/minha-mesa",
        due: t.due_date ? t.due_date.slice(0, 10) : null,
        bloqueante: false,
      });
    });

    // 5. Demandas novas (coordenação)
    demandas.forEach((d) => {
      out.push({
        key: `dem-${d.id}`,
        tipo: "demanda",
        titulo: d.nome_projeto,
        contexto: `${d.client?.name || "Cliente"} · pediu: ${d.solicitante_nome}`,
        acao: "Avaliar demanda nova",
        link: "/demandas",
        due: d.prazo_desejado ? d.prazo_desejado.slice(0, 10) : null,
        bloqueante: true,
      });
    });

    return out;
  }, [deliverables, tarefas, alteracoes, demandas, settings, user?.id]);

  const porBucket = useMemo(() => {
    const bucketDe = (it: Item): Bucket => {
      if (it.due && it.due < hoje) return "atrasado";
      if (it.bloqueante) return "espera";
      if (it.due && it.due <= em7) return "semana";
      return "andamento";
    };
    const g: Record<Bucket, Item[]> = { atrasado: [], espera: [], semana: [], andamento: [] };
    itens.forEach((it) => g[bucketDe(it)].push(it));
    const ordena = (arr: Item[]) =>
      arr.sort((a, b) => {
        if (a.bloqueante !== b.bloqueante) return a.bloqueante ? -1 : 1;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      });
    (Object.keys(g) as Bucket[]).forEach((k) => ordena(g[k]));
    return g;
  }, [itens, hoje, em7]);

  const total = itens.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      {/* Cabeçalho + resumo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Minha mesa</h1>
            <p className="text-sm text-muted-foreground">O que precisa de você — em ordem de prioridade.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {porBucket.atrasado.length > 0 && (
            <Chip cor="bg-destructive/15 text-destructive border-destructive/30" n={porBucket.atrasado.length} label="atrasado" />
          )}
          {porBucket.espera.length > 0 && (
            <Chip cor="bg-amber-500/15 text-amber-400 border-amber-500/30" n={porBucket.espera.length} label="te esperando" />
          )}
          {porBucket.semana.length > 0 && (
            <Chip cor="bg-blue-500/15 text-blue-400 border-blue-500/30" n={porBucket.semana.length} label="esta semana" />
          )}
        </div>
      </div>

      {total === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Sparkles className="h-8 w-8 text-emerald-400" />
            <p className="text-base font-medium text-foreground">Tudo em dia 🎉</p>
            <p className="text-sm text-muted-foreground">Nada precisa de você agora.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {SECOES.map((s) => {
            const lista = porBucket[s.id];
            if (lista.length === 0) return null;
            const Icon = s.icon;
            return (
              <div key={s.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${s.cor}`} />
                  <h2 className={`text-sm font-semibold ${s.cor}`}>{s.label}</h2>
                  <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">{lista.length}</span>
                  <span className="text-[11px] text-muted-foreground/70">· {s.hint}</span>
                </div>
                <Card className={`glass-card overflow-hidden ${s.id === "atrasado" ? "border-destructive/30" : ""}`}>
                  <CardContent className="p-0">
                    {lista.map((it) => (
                      <ItemRow key={it.key} it={it} hoje={hoje} />
                    ))}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ cor, n, label }: { cor: string; n: number; label: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cor}`}>
      {n} {label}
    </span>
  );
}

function ItemRow({ it, hoje }: { it: Item; hoje: string }) {
  const Icon = TIPO_ICON[it.tipo];
  const atrasado = it.due && it.due < hoje;
  return (
    <Link
      to={it.link}
      className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-0 hover:bg-sidebar-accent/40"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/40 ${TIPO_COR[it.tipo]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{it.titulo}</p>
        <p className="truncate text-xs text-muted-foreground">{it.contexto}</p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className={`text-xs font-medium ${it.bloqueante ? "text-amber-400" : "text-muted-foreground"}`}>{it.acao}</p>
        {it.due && (
          <p className={`text-[11px] ${atrasado ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
            {new Date(it.due + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            {atrasado ? " · atrasado" : ""}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
