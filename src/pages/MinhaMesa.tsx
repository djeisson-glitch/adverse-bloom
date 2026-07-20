import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Link } from "react-router-dom";
import {
  Clapperboard, Film, ThumbsUp, ChevronRight, Loader2, ListChecks,
  RefreshCw, Inbox, AlertTriangle, Clock, CalendarDays, Sparkles, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Minha mesa": o ÚNICO lugar onde a pessoa vê, em ordem de prioridade, tudo
 * que precisa dela — sem aba escondendo nada. E, pra quem coordena
 * (admin/produtor), um painel "No sistema" com o radar do time todo, pra
 * nada se perder em nenhum projeto.
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
  due: string | null;
  bloqueante: boolean;
  etapa?: string;
};

const ETAPA_LABEL: Record<string, string> = {
  pendente: "Pendente", em_edicao: "Em edição", em_pausa: "Em pausa", revisao_n1: "Revisão N1",
  revisao_n2: "Revisão N2", revisao: "Revisão", pronto: "Pronto pra enviar",
  com_cliente: "Com o cliente", ajuste_solicitado: "Ajuste do cliente", ajuste_interno: "Ajuste interno",
  aprovado: "Aprovado", entregue: "Entregue",
};

type SistItem = {
  key: string;
  tag: string;
  tone: "red" | "amber" | "purple";
  titulo: string;
  contexto: string;
  quem: string;
  due: string | null;
  link: string;
  ord: number;
  etapa?: string;
};

const TIPO_ICON: Record<Tipo, any> = { editar: Film, aprovar: ThumbsUp, alteracao: RefreshCw, tarefa: ListChecks, demanda: Inbox };
const TIPO_COR: Record<Tipo, string> = {
  editar: "text-primary", aprovar: "text-emerald-400", alteracao: "text-amber-400",
  tarefa: "text-blue-400", demanda: "text-purple-400",
};

const SECOES: { id: Bucket; label: string; hint: string; icon: any; cor: string }[] = [
  { id: "atrasado",  label: "Atrasado",        hint: "passou do prazo — resolve primeiro", icon: AlertTriangle, cor: "text-destructive" },
  { id: "espera",    label: "Precisa de você", hint: "está travando alguém",               icon: Clock,         cor: "text-amber-400" },
  { id: "semana",    label: "Esta semana",     hint: "prazo nos próximos 7 dias",          icon: CalendarDays,  cor: "text-blue-400" },
  { id: "andamento", label: "Em andamento",    hint: "seu trabalho aberto",                icon: ListChecks,    cor: "text-muted-foreground" },
];

const TONE_CHIP: Record<string, string> = {
  red: "bg-destructive/15 text-destructive border-destructive/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

function iso(d: Date) { return d.toISOString().slice(0, 10); }
const ATIVO = (s: string) => !["aprovado", "entregue", "cancelado", "reprovado"].includes(s);

export default function MinhaMesa() {
  const { user } = useAuth();
  const { can, isAdmin, isProdutor } = usePermissions();
  const coordena = isAdmin || isProdutor;
  const hoje = iso(new Date());
  const em7 = iso(new Date(Date.now() + 7 * 86400000));
  const podeDemandas = can("demandas");

  const { data: settings } = useQuery({
    queryKey: ["approval-settings"],
    queryFn: async () => (await (supabase as any).from("approval_settings").select("*").eq("id", true).maybeSingle()).data,
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
    queryFn: async () => (await (supabase as any).from("tasks")
      .select("id, title, due_date, project:projects(id, name)")
      .eq("assigned_user_id", user!.id).eq("completed", false)).data || [],
  });

  const { data: alteracoes = [] } = useQuery({
    queryKey: ["minha-mesa-alteracoes"],
    queryFn: async () => (await (supabase as any).from("deliverable_alteracoes")
      .select("id, titulo, status, prazo, responsavel_id, deliverable:deliverables(id, titulo, responsavel_id, data_entrega, project:projects(id, name, numero))")
      .eq("status", "aberta")).data || [],
  });

  const { data: demandas = [] } = useQuery({
    queryKey: ["minha-mesa-demandas"],
    enabled: podeDemandas,
    queryFn: async () => (await (supabase as any).from("demandas")
      .select("id, nome_projeto, solicitante_nome, prazo_desejado, client:clients(name)")
      .eq("status", "nova")).data || [],
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["minha-mesa-profiles"],
    enabled: coordena,
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name")).data || [],
  });
  const nomeDe = (uid: string | null | undefined) => (uid ? (profiles.find((p: any) => p.id === uid)?.full_name || "—") : "—");

  // ---------- Feed pessoal ----------
  const itens = useMemo<Item[]>(() => {
    if (!user?.id) return [];
    const out: Item[] = [];

    deliverables
      .filter((d) => d.responsavel_id === user.id && ["pendente", "em_edicao", "em_pausa", "ajuste_interno", "ajuste_solicitado"].includes(d.status))
      .forEach((d) => {
        // Ajuste (interno ou do cliente) = a bola voltou com ele; é bloqueante.
        const ajuste = d.status === "ajuste_interno" || d.status === "ajuste_solicitado";
        out.push({
          key: `edit-${d.id}`, tipo: "editar", titulo: d.titulo,
          contexto: `${d.project?.numero || ""} · ${d.project?.name || ""}`,
          acao: ajuste
            ? (d.status === "ajuste_interno" ? "Refazer — ajuste interno" : "Refazer — ajuste do cliente")
            : d.status === "pendente" ? "Começar edição"
            : d.status === "em_pausa" ? "Retomar edição"
            : "Continuar edição",
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`, due: d.data_entrega || null, bloqueante: ajuste,
          etapa: ETAPA_LABEL[d.status] || d.status,
        });
      });

    deliverables.forEach((d) => {
      const effN1 = d.project?.aprovador_n1_id ?? settings?.nivel1_user_id ?? null;
      const effN2 = d.project?.aprovador_n2_id ?? settings?.nivel2_user_id ?? null;
      const souN1 = effN1 === user.id && d.status === "revisao_n1" && !d.aprovado_n1_em;
      const souN2 = effN2 === user.id && d.status === "revisao_n2" && d.aprovado_n1_em && !d.aprovado_n2_em;
      if (souN1 || souN2) {
        out.push({
          key: `aprov-${d.id}`, tipo: "aprovar", titulo: d.titulo,
          contexto: `${d.project?.numero || ""} · ${d.project?.name || ""}`,
          acao: souN1 ? "Aprovar N1" : "Aprovar N2",
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`, due: d.data_entrega || null, bloqueante: true,
          etapa: ETAPA_LABEL[d.status] || d.status,
        });
      }
    });

    alteracoes
      .filter((a: any) => a.responsavel_id === user.id || a.deliverable?.responsavel_id === user.id)
      .forEach((a: any) => {
        out.push({
          key: `alt-${a.id}`, tipo: "alteracao", titulo: `${a.titulo} — ${a.deliverable?.titulo || "entregável"}`,
          contexto: `${a.deliverable?.project?.numero || ""} · ${a.deliverable?.project?.name || ""}`,
          acao: "Responder alteração do cliente",
          link: a.deliverable?.id ? `/projetos/${a.deliverable?.project?.id}/entregaveis/${a.deliverable.id}` : "#",
          due: a.prazo || a.deliverable?.data_entrega || null, bloqueante: true,
        });
      });

    tarefas.forEach((t: any) => {
      out.push({
        key: `task-${t.id}`, tipo: "tarefa", titulo: t.title, contexto: t.project?.name || "Tarefa",
        acao: "Fazer tarefa", link: t.project?.id ? `/projetos/${t.project.id}` : "/minha-mesa",
        due: t.due_date ? t.due_date.slice(0, 10) : null, bloqueante: false,
      });
    });

    demandas.forEach((d: any) => {
      out.push({
        key: `dem-${d.id}`, tipo: "demanda", titulo: d.nome_projeto,
        contexto: `${d.client?.name || "Cliente"} · pediu: ${d.solicitante_nome}`,
        acao: "Avaliar demanda nova", link: "/demandas",
        due: d.prazo_desejado ? d.prazo_desejado.slice(0, 10) : null, bloqueante: true,
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
    const ordena = (arr: Item[]) => arr.sort((a, b) => {
      if (a.bloqueante !== b.bloqueante) return a.bloqueante ? -1 : 1;
      if (!a.due) return 1; if (!b.due) return -1;
      return a.due.localeCompare(b.due);
    });
    (Object.keys(g) as Bucket[]).forEach((k) => ordena(g[k]));
    return g;
  }, [itens, hoje, em7]);

  // ---------- Radar do time (coordenação) ----------
  const sistema = useMemo<SistItem[]>(() => {
    if (!coordena) return [];
    const out: SistItem[] = [];
    deliverables.forEach((d) => {
      const ctx = `${d.project?.numero || ""} · ${d.project?.name || ""}`;
      const link = `/projetos/${d.project?.id}/entregaveis/${d.id}`;
      const etapa = ETAPA_LABEL[d.status] || d.status;
      if (d.data_entrega && d.data_entrega < hoje && ATIVO(d.status)) {
        out.push({ key: `s-atr-${d.id}`, tag: "Atrasado", tone: "red", titulo: d.titulo, contexto: ctx, quem: nomeDe(d.responsavel_id), due: d.data_entrega, link, ord: 0, etapa });
      } else if (["revisao_n1", "revisao_n2", "revisao"].includes(d.status)) {
        out.push({ key: `s-apr-${d.id}`, tag: "Aguardando aprovação", tone: "amber", titulo: d.titulo, contexto: ctx, quem: nomeDe(d.responsavel_id), due: d.data_entrega, link, ord: 1, etapa });
      }
    });
    alteracoes.forEach((a: any) => {
      out.push({
        key: `s-alt-${a.id}`, tag: "Alteração do cliente", tone: "amber",
        titulo: `${a.titulo} — ${a.deliverable?.titulo || ""}`,
        contexto: `${a.deliverable?.project?.numero || ""} · ${a.deliverable?.project?.name || ""}`,
        quem: nomeDe(a.responsavel_id || a.deliverable?.responsavel_id),
        due: a.prazo || a.deliverable?.data_entrega || null,
        link: a.deliverable?.id ? `/projetos/${a.deliverable?.project?.id}/entregaveis/${a.deliverable.id}` : "#", ord: 2,
      });
    });
    demandas.forEach((d: any) => {
      out.push({
        key: `s-dem-${d.id}`, tag: "Demanda nova", tone: "purple", titulo: d.nome_projeto,
        contexto: `${d.client?.name || ""} · pediu ${d.solicitante_nome}`, quem: "—",
        due: d.prazo_desejado ? d.prazo_desejado.slice(0, 10) : null, link: "/demandas", ord: 2,
      });
    });
    return out.sort((a, b) => (a.ord - b.ord) || (a.due || "9999").localeCompare(b.due || "9999"));
  }, [coordena, deliverables, alteracoes, demandas, profiles, hoje]);

  const total = itens.length;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const feed = total === 0 ? (
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
              <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">· {s.hint}</span>
            </div>
            <Card className={`glass-card overflow-hidden ${s.id === "atrasado" ? "border-destructive/30" : ""}`}>
              <CardContent className="p-0">
                {lista.map((it) => <ItemRow key={it.key} it={it} hoje={hoje} />)}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Minha mesa</h1>
            <p className="text-sm text-muted-foreground">O que precisa de você — em ordem de prioridade.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {porBucket.atrasado.length > 0 && <Chip cor={TONE_CHIP.red} n={porBucket.atrasado.length} label="atrasado" />}
          {porBucket.espera.length > 0 && <Chip cor={TONE_CHIP.amber} n={porBucket.espera.length} label="te esperando" />}
          {porBucket.semana.length > 0 && <Chip cor="bg-blue-500/15 text-blue-400 border-blue-500/30" n={porBucket.semana.length} label="esta semana" />}
        </div>
      </div>

      {coordena ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,380px)] lg:items-start">
          <div className="min-w-0">{feed}</div>
          <TeamPanel itens={sistema} hoje={hoje} />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl">{feed}</div>
      )}
    </div>
  );
}

function Chip({ cor, n, label }: { cor: string; n: number; label: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cor}`}>{n} {label}</span>;
}

function ItemRow({ it, hoje }: { it: Item; hoje: string }) {
  const Icon = TIPO_ICON[it.tipo];
  const atrasado = it.due && it.due < hoje;
  return (
    <Link to={it.link} className="flex items-start gap-3 border-b border-border/40 px-4 py-3 last:border-0 hover:bg-sidebar-accent/40">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/40 ${TIPO_COR[it.tipo]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="line-clamp-2 break-words text-sm font-medium leading-tight text-foreground" title={it.titulo}>
            {it.titulo}
          </p>
          {it.etapa && <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{it.etapa}</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground" title={it.contexto}>{it.contexto}</p>
      </div>
      <div className="hidden shrink-0 pt-0.5 text-right sm:block">
        <p className={`text-xs font-medium ${it.bloqueante ? "text-amber-400" : "text-muted-foreground"}`}>{it.acao}</p>
        {it.due && (
          <p className={`text-[11px] ${atrasado ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
            {new Date(it.due + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}{atrasado ? " · atrasado" : ""}
          </p>
        )}
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function TeamPanel({ itens, hoje }: { itens: SistItem[]; hoje: string }) {
  return (
    <div className="space-y-2 lg:sticky lg:top-20">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">No sistema</h2>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">{itens.length}</span>
        <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">· radar do time</span>
      </div>
      <Card className="glass-card overflow-hidden">
        <CardContent className="max-h-[72vh] space-y-0 overflow-y-auto p-0">
          {itens.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-muted-foreground">Nada pendente no time. 🎉</p>
          ) : (
            itens.map((it) => {
              const atrasado = it.due && it.due < hoje;
              return (
                <Link key={it.key} to={it.link} className="block border-b border-border/40 px-4 py-2.5 last:border-0 hover:bg-sidebar-accent/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 min-w-0 flex-1 break-words text-sm leading-tight text-foreground" title={it.titulo}>
                      {it.titulo}
                    </p>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium ${TONE_CHIP[it.tone]}`}>{it.tag}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{it.contexto}{it.etapa ? ` · ${it.etapa}` : ""}</span>
                    <span className="shrink-0">
                      {it.quem !== "—" ? it.quem : ""}
                      {it.due && <span className={atrasado ? "ml-1 font-semibold text-destructive" : "ml-1"}>
                        {new Date(it.due + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
