import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTimer } from "@/contexts/TimerContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Link } from "react-router-dom";
import {
  Clapperboard, ListChecks, ChevronRight, Loader2, Inbox, AlertTriangle,
  Clock, CalendarDays, Sparkles, Users, Play, ThumbsUp, RefreshCw,
  CheckCircle2, ExternalLink, MessageSquarePlus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as Fluxo from "@/lib/fluxoEntregavel";
import { iconeStatus, statusLabel } from "@/lib/statusEntregavel";
import { ResumoDoDia } from "@/components/ResumoDoDia";
import { MuralAvisos } from "@/components/MuralAvisos";

/**
 * "Minha mesa": o ÚNICO lugar onde a pessoa vê, em ordem de prioridade, tudo que
 * precisa dela — e RESOLVE ali mesmo. Cada item traz os botões do fluxo (os
 * mesmos de dentro do entregável, via lib/fluxoEntregavel): Editar, Enviar pra
 * revisão, Aprovar, Pedir ajuste, Enviar ao cliente. Pra quem coordena, um
 * painel "No sistema" com o radar do time todo.
 */

type Tipo = "editar" | "aprovar" | "enviar" | "cliente" | "tarefa" | "demanda";
type Bucket = "atrasado" | "espera" | "semana" | "andamento";

type Item = {
  key: string;
  tipo: Tipo;
  titulo: string;
  contexto: string;
  nota?: string;          // 2ª linha extra (ex.: alteração do cliente aberta)
  acao: string;
  link: string;
  due: string | null;
  bloqueante: boolean;
  d?: any;                // entregável cru — pras ações de fluxo
  alt?: any;              // alteração do cliente aberta ligada ao entregável
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

const TIPO_ICON: Record<Tipo, any> = {
  editar: Play, aprovar: ThumbsUp, enviar: ExternalLink, cliente: CheckCircle2,
  tarefa: ListChecks, demanda: Inbox,
};

// Só o "Atrasado" tem cor. As outras seções já se distinguem pelo título e
// pela ordem — pintar cada uma de um tom diferente fazia a tela inteira
// competir por atenção e, no fim, nada se destacava.
const SECOES: { id: Bucket; label: string; hint: string; icon: any; cor: string }[] = [
  { id: "atrasado",  label: "Atrasado",        hint: "passou do prazo — resolve primeiro", icon: AlertTriangle, cor: "text-destructive" },
  { id: "espera",    label: "Precisa de você", hint: "está travando alguém",               icon: Clock,         cor: "text-foreground" },
  { id: "semana",    label: "Esta semana",     hint: "prazo nos próximos 7 dias",          icon: CalendarDays,  cor: "text-foreground" },
  { id: "andamento", label: "Em andamento",    hint: "seu trabalho aberto",                icon: ListChecks,    cor: "text-muted-foreground" },
];

// Etiquetas do radar do time: neutras. Antes toda linha vinha com etiqueta
// colorida (e quase todas vermelhas) — com tudo vermelho, nada é urgente.
const TONE_CHIP: Record<string, string> = {
  red: "bg-muted/60 text-muted-foreground border-border/60",
  amber: "bg-muted/60 text-muted-foreground border-border/60",
  purple: "bg-muted/60 text-muted-foreground border-border/60",
};

// Botões de fluxo por item.
//
// UM acento por linha: a ação principal é sólida, a secundária é texto. Antes
// eram dois botões sólidos coloridos (verde + âmbar) em cada linha, o que
// somado ao ícone colorido e à pílula de status dava até 7 cores numa linha só.
type BtnCfg = { kind: string; label: string; Icon: any; cls: string; outline?: boolean };
const CLS_PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";
const CLS_SECUNDARIO = "text-muted-foreground hover:text-foreground";

function botoesDoItem(it: Item): BtnCfg[] {
  const s = it.d?.status;
  if (it.tipo === "editar") {
    if (s === "em_edicao") return [{ kind: "enviarRevisao", label: "Enviar p/ revisão", Icon: ThumbsUp, cls: CLS_PRIMARY }];
    return [{ kind: "editar", label: s === "em_pausa" ? "Retomar" : "Editar", Icon: Play, cls: CLS_PRIMARY }];
  }
  if (it.tipo === "aprovar") return [
    { kind: "aprovar", label: "Aprovar", Icon: CheckCircle2, cls: CLS_PRIMARY },
    { kind: "ajuste", label: "Ajuste", Icon: RefreshCw, cls: CLS_SECUNDARIO, outline: true },
  ];
  if (it.tipo === "enviar") return [{ kind: "enviarCliente", label: "Enviar ao cliente", Icon: ExternalLink, cls: CLS_PRIMARY }];
  if (it.tipo === "cliente") return [
    { kind: "clienteAprovou", label: "Cliente aprovou", Icon: CheckCircle2, cls: CLS_PRIMARY },
    { kind: "alteracaoCliente", label: "Alteração", Icon: MessageSquarePlus, cls: CLS_SECUNDARIO, outline: true },
  ];
  return [];
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }
const ATIVO = (s: string) => !["aprovado", "entregue", "cancelado", "reprovado"].includes(s);

export default function MinhaMesa() {
  const { user } = useAuth();
  const { can, isAdmin, isProdutor, isCoordenadora } = usePermissions();
  const { sessao, start, stop } = useTimer();
  const qc = useQueryClient();
  const coordena = isAdmin || isProdutor;
  const podeCliente = isAdmin || isProdutor || isCoordenadora;   // quem envia/fecha com o cliente
  const hoje = iso(new Date());
  const em7 = iso(new Date(Date.now() + 7 * 86400000));
  const podeDemandas = can("demandas");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["approval-settings"],
    queryFn: async () => (await (supabase as any).from("approval_settings").select("*").eq("id", true).maybeSingle()).data,
  });

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ["minha-mesa-deliverables"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status, formato, data_entrega, responsavel_id, retrabalho, rev_ajuste_pendente, revisoes_internas, aprovado_n1_em, aprovado_n2_em, project:projects(id, numero, name, client_name, aprovador_n1_id, aprovador_n2_id)")
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
      .select("id, titulo, status, prazo, responsavel_id, deliverable:deliverables(id, titulo, responsavel_id, data_entrega, project:projects(id, name, numero, client_name))")
      .eq("status", "aberta")).data || [],
  });

  const { data: demandas = [] } = useQuery({
    queryKey: ["minha-mesa-demandas"],
    enabled: podeDemandas,
    queryFn: async () => {
      const { data } = await (supabase as any).from("demandas")
        .select("id, nome_projeto, solicitante_nome, prazo_desejado, client_id")
        .eq("status", "nova");
      const rows = data || [];
      // Nome do cliente pela view pública (a tabela clients é trancada).
      const ids = [...new Set(rows.map((d: any) => d.client_id).filter(Boolean))] as string[];
      let nomes: Record<string, string> = {};
      if (ids.length) {
        const { data: cs } = await (supabase as any).from("clientes_publico").select("id, name").in("id", ids);
        nomes = Object.fromEntries((cs || []).map((c: any) => [c.id, c.name]));
      }
      return rows.map((d: any) => ({ ...d, client: d.client_id ? { name: nomes[d.client_id] || "" } : null }));
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["minha-mesa-profiles"],
    enabled: coordena,
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name")).data || [],
  });
  const nomeDe = (uid: string | null | undefined) => (uid ? (profiles.find((p: any) => p.id === uid)?.full_name || "—") : "—");

  // Alteração do cliente aberta de um entregável (pra dobrar dentro do item do editor).
  const altAbertaDe = (did: string) => alteracoes.find((a: any) => a.deliverable?.id === did);

  // ---------- Ação: dispara o fluxo (mesma lib do FluxoCard) ----------
  const agir = async (kind: string, it: Item) => {
    const d = it.d;
    if (!d) return;
    setBusy(it.key);
    try {
      if (kind === "editar") {
        if (sessao?.deliverable_id !== d.id) {
          const base = { project_id: d.project?.id, project_name: d.project?.name, deliverable_id: d.id };
          start(it.alt ? { ...base, alteracao_id: it.alt.id } : base);
        }
        if (d.status !== "em_edicao") await Fluxo.aplicarPatch(d.id, Fluxo.PATCH_EM_EDICAO);
        toast.success("Edição iniciada — cronômetro rodando");
      } else if (kind === "enviarRevisao") {
        if (sessao?.deliverable_id === d.id) await stop();
        toast.success(await Fluxo.enviarParaRevisao(d, it.alt?.id));
      } else if (kind === "aprovar") {
        toast.success(await Fluxo.aprovarEtapa(d, user?.id));
      } else if (kind === "ajuste") {
        // Um clique só: a mensagem única sai quando volta pro editor, apontando o Frame.io.
        toast.success(await Fluxo.pedirAjuste(d, user?.id));
      } else if (kind === "enviarCliente") {
        toast.success(await Fluxo.enviarAoCliente(d));
      } else if (kind === "clienteAprovou") {
        toast.success(await Fluxo.clienteAprovou(d));
      } else if (kind === "alteracaoCliente") {
        const titulo = window.prompt("Resumo do que o cliente pediu de alteração:");
        if (!titulo || !titulo.trim()) { setBusy(null); return; }
        toast.success(await Fluxo.registrarAlteracaoCliente(d, titulo));
      }
      await qc.invalidateQueries({ queryKey: ["minha-mesa-deliverables"] });
      await qc.invalidateQueries({ queryKey: ["minha-mesa-alteracoes"] });
    } catch (e: any) {
      toast.error("Erro", { description: e.message });
    } finally {
      setBusy(null);
    }
  };

  // ---------- Feed pessoal ----------
  const itens = useMemo<Item[]>(() => {
    if (!user?.id) return [];
    const out: Item[] = [];

    // EDITOR: meus entregáveis abertos. Alteração do cliente entra DENTRO do item
    // (não como linha separada) — some a duplicidade.
    deliverables
      .filter((d) => d.responsavel_id === user.id && ["pendente", "em_edicao", "em_pausa", "ajuste_interno", "ajuste_solicitado"].includes(d.status))
      .forEach((d) => {
        const alt = altAbertaDe(d.id);
        const ajuste = d.status === "ajuste_interno" || d.status === "ajuste_solicitado";
        out.push({
          key: `edit-${d.id}`, tipo: "editar", titulo: d.titulo,
          contexto: d.project?.client_name || d.project?.name || "",
          nota: alt ? `Alteração do cliente: ${alt.titulo}` : undefined,
          acao: ajuste
            ? (d.status === "ajuste_interno" ? "Refazer — ajuste interno" : "Refazer — ajuste do cliente")
            : d.status === "pendente" ? "Começar edição"
            : d.status === "em_pausa" ? "Retomar edição"
            : d.status === "em_edicao" ? "Editando" : "Continuar",
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`, due: d.data_entrega || null, bloqueante: ajuste,
          d, alt,
        });
      });

    // APROVAÇÃO: sou o aprovador designado (N1 ou N2).
    deliverables.forEach((d) => {
      const effN1 = d.project?.aprovador_n1_id ?? settings?.nivel1_user_id ?? null;
      const effN2 = d.project?.aprovador_n2_id ?? settings?.nivel2_user_id ?? null;
      const souN1 = effN1 === user.id && d.status === "revisao_n1" && !d.aprovado_n1_em;
      const souN2 = effN2 === user.id && d.status === "revisao_n2" && d.aprovado_n1_em && !d.aprovado_n2_em;
      if (souN1 || souN2) {
        out.push({
          key: `aprov-${d.id}`, tipo: "aprovar", titulo: d.titulo,
          contexto: d.project?.client_name || d.project?.name || "",
          acao: souN1 ? "Aprovar (Revisão 1)" : "Aprovar (Revisão 2)",
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`, due: d.data_entrega || null, bloqueante: true, d,
        });
      }
    });

    // ENVIAR AO CLIENTE / FECHAR COM O CLIENTE (coordenação).
    if (podeCliente) {
      deliverables.filter((d) => d.status === "pronto").forEach((d) => {
        out.push({
          key: `env-${d.id}`, tipo: "enviar", titulo: d.titulo,
          contexto: d.project?.client_name || d.project?.name || "",
          acao: "Enviar ao cliente", link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
          due: d.data_entrega || null, bloqueante: true, d,
        });
      });
      deliverables.filter((d) => d.status === "com_cliente").forEach((d) => {
        out.push({
          key: `cli-${d.id}`, tipo: "cliente", titulo: d.titulo,
          contexto: d.project?.client_name || d.project?.name || "",
          acao: "Aguardando o cliente", link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
          due: d.data_entrega || null, bloqueante: false, d,
        });
      });
    }

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
  }, [deliverables, tarefas, alteracoes, demandas, settings, user?.id, podeCliente]);

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
      const ctx = d.project?.client_name || d.project?.name || "";
      const link = `/projetos/${d.project?.id}/entregaveis/${d.id}`;
      const etapa = statusLabel(d.status);
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
        contexto: a.deliverable?.project?.client_name || a.deliverable?.project?.name || "",
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
        <Sparkles className="h-8 w-8 text-success" />
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
              
            </div>
            <Card className={`glass-card overflow-hidden ${s.id === "atrasado" ? "border-destructive/30" : ""}`}>
              <CardContent className="p-0">
                {lista.map((it) => <ItemRow key={it.key} it={it} hoje={hoje} busy={busy === it.key} onAgir={agir} />)}
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
            <p className="text-sm text-muted-foreground">O que precisa de você — resolva direto por aqui.</p>
          </div>
        </div>
        {/* Só o atrasado é vermelho. Os outros dois são contagem, não alarme. */}
        <div className="flex flex-wrap gap-2">
          {porBucket.atrasado.length > 0 && (
            <Chip cor="bg-destructive/15 text-destructive border-destructive/30" n={porBucket.atrasado.length} label="atrasado" />
          )}
          {porBucket.espera.length > 0 && (
            <Chip cor="bg-muted/60 text-muted-foreground border-border/60" n={porBucket.espera.length} label="te esperando" />
          )}
          {porBucket.semana.length > 0 && (
            <Chip cor="bg-muted/60 text-muted-foreground border-border/60" n={porBucket.semana.length} label="esta semana" />
          )}
        </div>
      </div>

      <ResumoDoDia />
      <MuralAvisos />

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

function ItemRow({ it, hoje, busy, onAgir }: { it: Item; hoje: string; busy: boolean; onAgir: (kind: string, it: Item) => void }) {
  const atrasado = it.due && it.due < hoje;
  const ehEntreg = !!it.d;
  const Icon = ehEntreg ? iconeStatus(it.d.status) : TIPO_ICON[it.tipo];
  const botoes = botoesDoItem(it);

  // Uma linha, uma informação por vez: título, contexto e — na mesma linha —
  // etapa e prazo em texto miúdo. O ícone perdeu a caixa colorida e a etapa
  // deixou de ser pílula: a cor agora só aparece quando está atrasado.
  return (
    <div className="flex items-start gap-3 border-b border-border/40 px-4 py-2.5 last:border-0 hover:bg-sidebar-accent/40">
      <Link to={it.link} className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${atrasado ? "text-destructive" : "text-muted-foreground"}`} />
        <div className="min-w-0 flex-1">
          {/* Título QUEBRA em vez de cortar: o nome completo do entregável é
              o que identifica a peça (pedido antigo). Só o contexto abaixo,
              que é secundário, pode ser truncado. */}
          <p className="line-clamp-2 break-words text-sm font-medium leading-tight text-foreground" title={it.titulo}>
            {it.titulo}
          </p>
          {/* Prazo PRIMEIRO: numa linha truncada, o que está no fim é o que
              some — e o prazo é justamente o que não pode sumir. O código do
              projeto, que é o mais longo, fica por último de propósito. */}
          <p className="truncate text-xs text-muted-foreground">
            {it.due && (
              <span className={atrasado ? "font-medium text-destructive" : "text-foreground/70"}>
                {new Date(it.due + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                {atrasado ? " · atrasado" : ""}
                {" · "}
              </span>
            )}
            {ehEntreg && <span>{statusLabel(it.d.status)} · </span>}
            <span title={it.contexto}>{it.contexto}</span>
          </p>
          {it.nota && <p className="truncate text-[11px] text-muted-foreground" title={it.nota}>↻ {it.nota}</p>}
        </div>
      </Link>

      {botoes.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {botoes.map((b) => (
            <Button
              key={b.kind}
              size="sm"
              variant={b.outline ? "outline" : "default"}
              disabled={busy}
              onClick={() => onAgir(b.kind, it)}
              className={`h-7 px-2.5 text-xs ${b.cls}`}
            >
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <b.Icon className="mr-1 h-3.5 w-3.5" />}
              {b.label}
            </Button>
          ))}
        </div>
      ) : (
        <Link to={it.link} className="flex shrink-0 items-center gap-1 self-center text-xs font-medium text-muted-foreground hover:text-foreground">
          <span className="hidden sm:inline">{it.acao}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
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
