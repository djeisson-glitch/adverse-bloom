import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { NotificacoesCard } from "@/components/NotificacoesCard";
import {
  CheckCircle2, Clapperboard, Timer, AlertTriangle, ArrowRight,
  CalendarDays, CalendarCheck, ListChecks, Film, UserCheck, Send, Hourglass, MessageSquarePlus,
} from "lucide-react";

/**
 * Home de quem não vê dinheiro. DUAS visões, pelo que a pessoa faz:
 *
 *  • Editor/equipe (vê horas) → a fila DELE: tarefas, vídeos na mão, horas.
 *  • Coordenação (não vê horas, ex.: Maiara) → o PANORAMA do time: quantos
 *    entregáveis em cada etapa (a iniciar, em edição, aprovação interna, com o
 *    cliente), o que está atrasado e o que vence primeiro — sem nada de horas.
 *
 * É panorama, não lista: a lista onde se opera é a Minha mesa. Aqui orienta e
 * manda pra lá.
 */

function inicioDaSemana() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

const prazoDe = (d: any) => d.prazo_interno || d.data_entrega || null;

export default function HomeEquipe() {
  const { profile } = useAuth();
  const { canSeeHours } = usePermissions();
  const primeiroNome = profile?.full_name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Olá{primeiroNome ? `, ${primeiroNome}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <NotificacoesCard />

      {canSeeHours ? <PainelEditor /> : <PainelCoordenacao />}
    </div>
  );
}

/* ============================================================ EDITOR */

function PainelEditor() {
  const { user, profile } = useAuth();
  const hoje = hojeISO();

  const { data: tarefas = [] } = useQuery({
    queryKey: ["home-eq-tarefas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tasks")
        .select("id, title, due_date, project:projects(id, name)")
        .eq("assigned_user_id", user!.id)
        .eq("completed", false)
        .order("due_date", { nullsFirst: false });
      return (data as any[]) || [];
    },
  });

  const { data: entregaveis = [] } = useQuery({
    queryKey: ["home-eq-entregaveis", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status, prazo_interno, data_entrega, project_id, project:projects(id, name)")
        .eq("responsavel_id", user!.id)
        .not("status", "in", "(aprovado,entregue)")
        .order("prazo_interno", { nullsFirst: false });
      return (data as any[]) || [];
    },
  });

  const { data: minutosSemana = 0 } = useQuery({
    queryKey: ["home-eq-horas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("duration_min")
        .eq("user_id", user!.id)
        .gte("start_at", inicioDaSemana().toISOString());
      return ((data as any[]) || []).reduce((s, e) => s + (e.duration_min || 0), 0);
    },
  });

  const tarefasAtrasadas = tarefas.filter((t: any) => t.due_date && t.due_date < hoje).length;
  const entregasAtrasadas = entregaveis.filter((d: any) => prazoDe(d) && prazoDe(d) < hoje).length;

  const horas = minutosSemana / 60;
  const meta = profile?.horas_semana || 40;
  const pct = Math.min(100, Math.round((horas / Math.max(meta, 1)) * 100));

  const proximos = [
    ...tarefas
      .filter((t: any) => t.due_date)
      .map((t: any) => ({ id: `t-${t.id}`, tipo: "tarefa" as const, titulo: t.title, prazo: t.due_date, projeto: t.project?.name, url: t.project?.id ? `/projetos/${t.project.id}` : "/minha-mesa" })),
    ...entregaveis
      .filter((d: any) => prazoDe(d))
      .map((d: any) => ({ id: `d-${d.id}`, tipo: "entrega" as const, titulo: d.titulo, prazo: prazoDe(d), projeto: d.project?.name, url: `/projetos/${d.project_id}/entregaveis/${d.id}` })),
  ]
    .sort((a, b) => (a.prazo < b.prazo ? -1 : 1))
    .slice(0, 4);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Resumo
          to="/minha-mesa"
          icon={CheckCircle2}
          label="Tarefas pendentes"
          valor={tarefas.length}
          alerta={tarefasAtrasadas > 0 ? `${tarefasAtrasadas} atrasada${tarefasAtrasadas > 1 ? "s" : ""}` : undefined}
        />
        <Resumo
          to="/minha-mesa"
          icon={Clapperboard}
          label="Na sua mão"
          valor={entregaveis.length}
          alerta={entregasAtrasadas > 0 ? `${entregasAtrasadas} atrasado${entregasAtrasadas > 1 ? "s" : ""}` : undefined}
          sufixo="vídeo(s)"
        />
        <Link to="/horas" className="block">
          <Card className="glass-card h-full transition hover:border-primary/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Timer className="h-3.5 w-3.5 text-primary" /> Horas da semana
              </div>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {horas.toFixed(1).replace(".", ",")}h
                <span className="ml-1 text-sm font-normal text-muted-foreground">de {meta}h</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <VencePrimeiro proximos={proximos} hoje={hoje} comResponsavel={false} />

      <div className="grid gap-2 sm:grid-cols-4">
        <Atalho to="/minha-mesa" icon={ListChecks} label="Minha mesa" />
        <Atalho to="/horas" icon={Timer} label="Apontar horas" />
        <Atalho to="/timesheet" icon={CalendarCheck} label="Timesheet" />
        <Atalho to="/calendario" icon={CalendarDays} label="Calendário" />
      </div>
    </>
  );
}

/* ====================================================== COORDENAÇÃO */

// Etapas que a coordenação acompanha, na ordem do fluxo.
const ETAPAS: Record<string, "fila" | "edicao" | "aprovacao" | "cliente"> = {
  pendente: "fila",
  em_edicao: "edicao",
  ajuste_solicitado: "edicao",
  revisao_n1: "aprovacao",
  revisao_n2: "aprovacao",
  revisao: "aprovacao",
  pronto: "aprovacao",
  com_cliente: "cliente",
};

function PainelCoordenacao() {
  const hoje = hojeISO();

  // Todos os entregáveis ativos do time (RLS deixa autenticado ler tudo).
  const { data: entregaveis = [] } = useQuery({
    queryKey: ["home-coord-entregaveis"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status, prazo_interno, data_entrega, responsavel_id, project_id, project:projects(id, name)")
        .not("status", "in", "(aprovado,entregue)")
        .order("prazo_interno", { nullsFirst: false });
      return (data as any[]) || [];
    },
    // Atualiza sozinho — a coordenação vive olhando isso ao longo do dia.
    refetchInterval: 30000,
  });

  // Nome do responsável (o FK aponta pra auth.users, então resolve no cliente).
  const { data: profiles = [] } = useQuery({
    queryKey: ["home-coord-profiles"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, full_name, email");
      return (data as any[]) || [];
    },
  });
  const nomeDe = (uid: string | null) => {
    const p = profiles.find((x: any) => x.id === uid);
    return p?.full_name?.split(" ")[0] || p?.email?.split("@")[0] || "sem dono";
  };

  const { data: alteracoesAbertas = 0 } = useQuery({
    queryKey: ["home-coord-alteracoes"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("deliverable_alteracoes")
        .select("id", { count: "exact", head: true })
        .eq("status", "aberta");
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const porEtapa = (e: string) => entregaveis.filter((d: any) => ETAPAS[d.status] === e);
  const naFila = porEtapa("fila");
  const emEdicao = porEtapa("edicao");
  const aprovacao = porEtapa("aprovacao");
  const comCliente = porEtapa("cliente");
  const atrasados = entregaveis.filter((d: any) => prazoDe(d) && prazoDe(d) < hoje);

  const proximos = entregaveis
    .filter((d: any) => prazoDe(d))
    .sort((a: any, b: any) => (prazoDe(a) < prazoDe(b) ? -1 : 1))
    .slice(0, 6)
    .map((d: any) => ({
      id: `d-${d.id}`,
      tipo: "entrega" as const,
      titulo: d.titulo,
      prazo: prazoDe(d),
      projeto: nomeDe(d.responsavel_id),
      url: `/projetos/${d.project_id}/entregaveis/${d.id}`,
    }));

  return (
    <>
      {/* Panorama por etapa — o coração do que a coordenação precisa ver. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <EtapaCard to="/projetos" icon={Hourglass} label="A iniciar" valor={naFila.length} tom="text-slate-400" />
        <EtapaCard to="/projetos" icon={Film} label="Em edição" valor={emEdicao.length} tom="text-primary" />
        <EtapaCard to="/minha-mesa" icon={UserCheck} label="Aprovação interna" valor={aprovacao.length} tom="text-amber-400" />
        <EtapaCard to="/projetos" icon={Send} label="Com o cliente" valor={comCliente.length} tom="text-cyan-400" />
      </div>

      {/* Precisa de atenção: atrasados + alterações abertas. */}
      {(atrasados.length > 0 || alteracoesAbertas > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Resumo
            to="/minha-mesa"
            icon={AlertTriangle}
            label="Entregas atrasadas"
            valor={atrasados.length}
            alerta={atrasados.length > 0 ? "precisam de você" : undefined}
          />
          <Resumo
            to="/minha-mesa"
            icon={MessageSquarePlus}
            label="Alterações abertas"
            valor={alteracoesAbertas as number}
            alerta={alteracoesAbertas > 0 ? "pedidas pelo cliente" : undefined}
          />
        </div>
      )}

      <VencePrimeiro proximos={proximos} hoje={hoje} comResponsavel />

      <div className="grid gap-2 sm:grid-cols-4">
        <Atalho to="/minha-mesa" icon={ListChecks} label="Minha mesa" />
        <Atalho to="/projetos" icon={Clapperboard} label="Projetos" />
        <Atalho to="/pauta" icon={Film} label="Pauta" />
        <Atalho to="/calendario" icon={CalendarDays} label="Calendário" />
      </div>
    </>
  );
}

/* ------------------------------------------------ blocos compartilhados */

function VencePrimeiro({
  proximos, hoje, comResponsavel,
}: {
  proximos: { id: string; tipo: string; titulo: string; prazo: string; projeto?: string; url: string }[];
  hoje: string;
  comResponsavel: boolean;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">O que vence primeiro</p>
          <Link
            to={comResponsavel ? "/projetos" : "/minha-mesa"}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {comResponsavel ? "Ver a fila do time" : "Ver tudo na Minha mesa"} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {proximos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada com prazo por perto 🎉</p>
        ) : (
          <div className="space-y-1.5">
            {proximos.map((p) => {
              const atrasado = p.prazo < hoje;
              return (
                <Link key={p.id} to={p.url} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${atrasado ? "bg-destructive" : "bg-primary"}`} />
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {p.tipo}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {p.titulo}
                    {p.projeto && <span className="text-muted-foreground"> · {p.projeto}</span>}
                  </span>
                  <span className={`shrink-0 text-xs ${atrasado ? "text-destructive" : "text-muted-foreground"}`}>
                    {atrasado && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                    {fmtDia(p.prazo)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EtapaCard({
  to, icon: Icon, label, valor, tom,
}: {
  to: string; icon: any; label: string; valor: number; tom: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="glass-card h-full transition hover:border-primary/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className={`h-3.5 w-3.5 ${tom}`} /> {label}
          </div>
          <p className={`mt-1 text-2xl font-semibold ${valor > 0 ? "text-foreground" : "text-muted-foreground"}`}>{valor}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function Resumo({
  to, icon: Icon, label, valor, alerta, sufixo,
}: {
  to: string; icon: any; label: string; valor: number; alerta?: string; sufixo?: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="glass-card h-full transition hover:border-primary/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5 text-primary" /> {label}
          </div>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {valor}
            {sufixo && <span className="ml-1 text-sm font-normal text-muted-foreground">{sufixo}</span>}
          </p>
          <p className={`mt-2 text-[11px] ${alerta ? "text-destructive" : "text-muted-foreground"}`}>
            {alerta || "em dia"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function Atalho({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-sm text-foreground transition hover:border-primary/40 hover:bg-muted/40"
    >
      <Icon className="h-4 w-4 text-primary" /> {label}
    </Link>
  );
}
