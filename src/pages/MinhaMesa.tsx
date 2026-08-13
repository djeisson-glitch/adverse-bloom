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
  CheckCircle2, ExternalLink, MessageSquarePlus, Square, PauseCircle,
} from "lucide-react";
import { rotuloAtraso, diasDeAtraso } from "@/lib/leadCadencia";
import { TEMPERATURAS } from "./Leads";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as Fluxo from "@/lib/fluxoEntregavel";
import { statusLabel } from "@/lib/statusEntregavel";
import { estaAtrasado, prazoDe } from "@/lib/prazoEntregavel";
import { primeiroNome } from "@/lib/pessoa";
import { ResumoDoDia } from "@/components/ResumoDoDia";
import { MuralAvisos } from "@/components/MuralAvisos";
import { AvisoPushDesligado } from "@/components/AvisoPushDesligado";
import { dataISO } from "@/lib/dataLocal";

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
  /** Já resolvido pela regra: prazo INTERNO e só enquanto está na nossa mão. */
  atrasado: boolean;
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
  atrasado: boolean;
  link: string;
  ord: number;
  etapa?: string;
};

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

const iso = dataISO;

/** Dias entre hoje e uma data ISO (negativo = passado). */
function diasAte(due: string, hoje: string) {
  return Math.round((new Date(due + "T00:00:00").getTime() - new Date(hoje + "T00:00:00").getTime()) / 86400000);
}

/**
 * Prazo dito em urgência, não em data. "06 de ago." obriga a pessoa a fazer a
 * conta; "em 9 dias" já é a conta feita. Só no destaque — na lista de baixo a
 * data continua, que é mais compacta.
 */
function prazoNatural(due: string | null, hoje: string) {
  if (!due) return "sem prazo";
  const d = diasAte(due, hoje);
  if (d < 0) return `atrasado ${-d} ${-d === 1 ? "dia" : "dias"}`;
  if (d === 0) return "vence hoje";
  if (d === 1) return "vence amanhã";
  if (d <= 13) return `em ${d} dias`;
  return new Date(due + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * Há quantos dias esse item não se mexe.
 *
 * Base é deliverables.updated_at, agora mantido por trigger no banco
 * (20260728140000). Nas linhas anteriores a essa migration a coluna guarda a
 * data da importação do ClickUp — o número só fica fiel dali pra frente.
 */
function diasParado(ts: string | null | undefined) {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
}

/**
 * Por que ESTE item está no topo. A tela escolhe — e diz o motivo, senão a
 * escolha vira palpite invisível.
 */
function motivoDoTopo(it: Item, hoje: string): string {
  if (it.atrasado) return prazoNatural(it.due, hoje);
  if (it.due === hoje) return "vence hoje";
  if (it.d?.status === "ajuste_interno") return "pediram ajuste interno";
  if (it.d?.status === "ajuste_solicitado") return "o cliente pediu ajuste";
  if (it.tipo === "aprovar") return "te esperando aprovar";
  if (it.tipo === "enviar") return "pronto — falta enviar ao cliente";
  if (it.tipo === "demanda") return "demanda nova pra avaliar";
  return prazoNatural(it.due, hoje);
}

/** 0 = mais urgente. Acima de 2 não entra no destaque. */
function urgencia(it: Item, hoje: string): number {
  if (it.atrasado) return 0;
  if (it.due === hoje) return 1;
  if (it.bloqueante) return 2;
  return 9;
}
const ATIVO = (s: string) => !["aprovado", "entregue", "cancelado", "reprovado"].includes(s);

/**
 * Em que faixa de prazo o item cai — o que a cor comunica.
 *
 * Pedido do Djêisson vendo dez itens em "Pra eu editar": os três atrasados se
 * perdiam no meio dos que vencem em setembro. A ordem já era a certa, mas
 * ordem sem marca visual não separa nada — o olho não vê onde o vermelho
 * acaba.
 *
 * Só três faixas, de propósito. Quatro ou cinco viram um degradê que ninguém
 * decodifica; três é "estou devendo / é pra já / dá tempo".
 */
type Faixa = "vencido" | "agora" | "fila";

function faixaDe(it: Item, hoje: string): Faixa {
  if (it.atrasado) return "vencido";
  if (!it.due) return "fila";
  // "Esta semana" = até 7 dias. Prazo de produção se mede em dias, e o que
  // vence na sexta precisa aparecer na segunda.
  const dias = Math.round((new Date(it.due + "T00:00:00").getTime() - new Date(hoje + "T00:00:00").getTime()) / 86400000);
  return dias <= 7 ? "agora" : "fila";
}

const FAIXAS: { id: Faixa; titulo: string; barra: string }[] = [
  { id: "vencido", titulo: "Vencido",            barra: "bg-destructive" },
  { id: "agora",   titulo: "Hoje e esta semana", barra: "bg-warning" },
  { id: "fila",    titulo: "Na fila",            barra: "bg-border" },
];

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
        .select("id, codigo, titulo, status, formato, data_entrega, responsavel_id, retrabalho, rev_ajuste_pendente, revisoes_internas, aprovado_n1_em, aprovado_n2_em, aprovado_cliente_em, updated_at, etapa_atual, etapa_responsavel_id, project:projects(id, numero, name, client_name, aprovador_n1_id, aprovador_n2_id, envio_cliente_id)")
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
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name, avatar_url")).data || [],
  });
  const nomeDe = (uid: string | null | undefined) =>
    uid ? primeiroNome(profiles.find((p: any) => p.id === uid)?.full_name) : "—";

  // Alteração do cliente aberta de um entregável (pra dobrar dentro do item do editor).
  const altAbertaDe = (did: string) => alteracoes.find((a: any) => a.deliverable?.id === did);

  // ---------- Ação: dispara o fluxo (mesma lib do FluxoCard) ----------
  const agir = async (kind: string, it: Item) => {
    const d = it.d;
    if (!d) return;
    setBusy(it.key);
    try {
      if (kind === "cronometro") {
        // Rastrear sem mexer no fluxo: às vezes a pessoa só volta pra mexer
        // numa peça, sem mudar a etapa dela.
        if (sessao?.deliverable_id === d.id) { await stop(); }
        else {
          const base = { project_id: d.project?.id, project_name: d.project?.name, deliverable_id: d.id, task_title: d.titulo };
          start(it.alt ? { ...base, alteracao_id: it.alt.id } : base);
        }
      } else if (kind === "editar") {
        if (sessao?.deliverable_id !== d.id) {
          const base = { project_id: d.project?.id, project_name: d.project?.name, deliverable_id: d.id, task_title: d.titulo };
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

  /**
   * Quem está com a peça AGORA.
   *
   * A etapa vence o responsável. Desde que passar pra Color deixou de trocar o
   * responsável (05/08 — e com razão: quem responde pelo entregável de ponta a
   * ponta não muda), a mesa continuou filtrando só por `responsavel_id`. A
   * peça ia pro color no banco e não chegava na mesa de ninguém: sumia da
   * lista de quem passou e nunca aparecia na de quem recebeu.
   *
   * Media três peças assim hoje — duas em color com o Djêisson, que nunca as
   * viu. Era esse o "passar de etapa pra etapa não está funcionando".
   */
  const quemEstaCom = (d: any) => d.etapa_responsavel_id || d.responsavel_id;
  const nomeEtapa = (slug: string) => etapas.find((e: any) => e.slug === slug)?.nome || slug;

  /**
   * Gravações dos próximos dias.
   *
   * Ficam na mesa porque sair a campo é a única coisa que não dá pra
   * remarcar de manhã — e hoje a saída de amanhã não aparecia em lugar
   * nenhum que a pessoa abre todo dia.
   *
   * NÃO filtra por pessoa, de propósito: `producao_saidas.equipe` aponta pra
   * `team_members`, que está VAZIA no banco. Filtrar por um vínculo que
   * ninguém preenche esconderia todas as gravações de todo mundo — pior que
   * mostrar as do time. Quando a escala existir, o filtro entra aqui.
   */
  const { data: gravacoes = [] } = useQuery({
    queryKey: ["minha-mesa-gravacoes"],
    queryFn: async () => {
      const hojeISO = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("producao_saidas")
        .select("id, titulo, data, hora_inicio, local, tipo, status, project:projects(id, name, client_name)")
        .gte("data", hojeISO).neq("status", "cancelada")
        .order("data").limit(8);
      return (data as any[]) || [];
    },
  });

  /**
   * Leads cujo toque venceu ou vence hoje.
   *
   * Meus e os sem dono: lead sem responsável não é de ninguém, e é assim que
   * ele morre. Convertido e descartado ficam de fora — esses já saíram da
   * nutrição.
   */
  const { data: leadsPraTocar = [] } = useQuery({
    queryKey: ["minha-mesa-leads", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("id, nome, empresa, temperatura, proximo_toque, motivo_toque, responsavel_id, status")
        .lte("proximo_toque", dataISO())
        .order("proximo_toque");
      if (error) throw error;
      // Status e dono filtrados aqui, não no PostgREST: a sintaxe de `not.in`
      // erra calado — devolve lista vazia em vez de estourar — e uma mesa que
      // esconde lead vencido é exatamente a falha que este bloco existe pra
      // consertar. São poucas linhas; filtrar em JS não custa nada.
      return ((data as any[]) || []).filter(
        (l) =>
          !["convertido", "descartado"].includes(l.status) &&
          (!l.responsavel_id || l.responsavel_id === user!.id),
      );
    },
  });

  // Nomes das etapas — a mesa mostra "Sua vez — Color", não "color".
  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pos"],
    queryFn: async () => (await (supabase as any).from("etapas_pos").select("slug, nome").order("ordem")).data || [],
    staleTime: 60 * 60 * 1000,
  });

  // ---------- Feed pessoal ----------
  const itens = useMemo<Item[]>(() => {
    if (!user?.id) return [];
    const out: Item[] = [];

    // EDITOR: os entregáveis que estão COMIGO agora. Alteração do cliente entra
    // DENTRO do item (não como linha separada) — some a duplicidade.
    deliverables
      .filter((d) => quemEstaCom(d) === user.id && ["pendente", "em_edicao", "em_pausa", "ajuste_interno", "ajuste_solicitado"].includes(d.status))
      .forEach((d) => {
        const alt = altAbertaDe(d.id);
        const ajuste = d.status === "ajuste_interno" || d.status === "ajuste_solicitado";
        // Peça que chegou POR ETAPA diz qual trabalho é. "Começar edição" numa
        // peça que veio pro color manda a pessoa fazer a coisa errada — e o
        // nome da etapa é a única informação que distingue as duas.
        const porEtapa = !!d.etapa_responsavel_id && d.etapa_atual
          ? nomeEtapa(d.etapa_atual) : null;
        out.push({
          key: `edit-${d.id}`, tipo: "editar", titulo: d.titulo,
          contexto: d.project?.client_name || d.project?.name || "",
          nota: alt ? `Alteração do cliente: ${alt.titulo}` : undefined,
          acao: ajuste
            ? (d.status === "ajuste_interno" ? "Refazer — ajuste interno" : "Refazer — ajuste do cliente")
            : porEtapa ? `Sua vez — ${porEtapa}`
            : d.status === "pendente" ? "Começar edição"
            : d.status === "em_pausa" ? "Retomar edição"
            : d.status === "em_edicao" ? "Editando" : "Continuar",
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
          due: prazoDe(d), atrasado: estaAtrasado(d, hoje), bloqueante: ajuste,
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
          link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
          due: prazoDe(d), atrasado: estaAtrasado(d, hoje), bloqueante: true, d,
        });
      }
    });

    // ENVIAR AO CLIENTE / FECHAR COM O CLIENTE (coordenação).
    // "Falta enviar ao cliente" é de UMA pessoa, não do papel. Antes caía na
    // mesa de toda a coordenação e virava item com botão laranja que não era
    // seu. Sem ninguém configurado, segue caindo pra coordenação — não some
    // da vista de quem hoje resolve.
    deliverables.filter((d) => d.status === "pronto").forEach((d) => {
      const dono = d.project?.envio_cliente_id ?? settings?.envio_cliente_user_id ?? null;
      if (dono ? dono !== user.id : !podeCliente) return;
      out.push({
        key: `env-${d.id}`, tipo: "enviar", titulo: d.titulo,
        contexto: d.project?.client_name || d.project?.name || "",
        acao: "Enviar ao cliente", link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
        due: prazoDe(d), atrasado: estaAtrasado(d, hoje), bloqueante: true, d,
      });
    });

    if (podeCliente) {
      deliverables.filter((d) => d.status === "com_cliente").forEach((d) => {
        out.push({
          key: `cli-${d.id}`, tipo: "cliente", titulo: d.titulo,
          contexto: d.project?.client_name || d.project?.name || "",
          acao: "Aguardando o cliente", link: `/projetos/${d.project?.id}/entregaveis/${d.id}`,
          due: prazoDe(d), atrasado: false, bloqueante: false, d,
        });
      });
    }

    tarefas.forEach((t: any) => {
      out.push({
        key: `task-${t.id}`, tipo: "tarefa", titulo: t.title, contexto: t.project?.name || "Tarefa",
        acao: "Fazer tarefa", link: t.project?.id ? `/projetos/${t.project.id}` : "/minha-mesa",
        due: t.due_date ? t.due_date.slice(0, 10) : null,
        atrasado: !!(t.due_date && t.due_date.slice(0, 10) < hoje), bloqueante: false,
      });
    });

    demandas.forEach((d: any) => {
      out.push({
        key: `dem-${d.id}`, tipo: "demanda", titulo: d.nome_projeto,
        contexto: `${d.client?.name || "Cliente"} · pediu: ${d.solicitante_nome}`,
        acao: "Avaliar demanda nova", link: "/demandas",
        due: d.prazo_desejado ? d.prazo_desejado.slice(0, 10) : null,
        atrasado: !!(d.prazo_desejado && d.prazo_desejado.slice(0, 10) < hoje), bloqueante: true,
      });
    });

    return out;
  }, [deliverables, tarefas, alteracoes, demandas, settings, user?.id, podeCliente, hoje]);

  const porBucket = useMemo(() => {
    const bucketDe = (it: Item): Bucket => {
      if (it.atrasado) return "atrasado";
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
      if (estaAtrasado(d, hoje) && ATIVO(d.status)) {
        out.push({ key: `s-atr-${d.id}`, tag: "Atrasado", tone: "red", titulo: d.titulo, contexto: ctx, quem: nomeDe(d.responsavel_id), due: prazoDe(d), atrasado: true, link, ord: 0, etapa });
      } else if (["revisao_n1", "revisao_n2", "revisao"].includes(d.status)) {
        out.push({ key: `s-apr-${d.id}`, tag: "Aguardando aprovação", tone: "amber", titulo: d.titulo, contexto: ctx, quem: nomeDe(d.responsavel_id), due: prazoDe(d), atrasado: estaAtrasado(d, hoje), link, ord: 1, etapa });
      }
    });
    alteracoes.forEach((a: any) => {
      out.push({
        key: `s-alt-${a.id}`, tag: "Alteração do cliente", tone: "amber",
        titulo: `${a.titulo} — ${a.deliverable?.titulo || ""}`,
        contexto: a.deliverable?.project?.client_name || a.deliverable?.project?.name || "",
        quem: nomeDe(a.responsavel_id || a.deliverable?.responsavel_id),
        due: a.prazo || prazoDe(a.deliverable) || null,
        atrasado: !!((a.prazo || prazoDe(a.deliverable)) && (a.prazo || prazoDe(a.deliverable)) < hoje),
        link: a.deliverable?.id ? `/projetos/${a.deliverable?.project?.id}/entregaveis/${a.deliverable.id}` : "#", ord: 2,
      });
    });
    demandas.forEach((d: any) => {
      out.push({
        key: `s-dem-${d.id}`, tag: "Demanda nova", tone: "purple", titulo: d.nome_projeto,
        contexto: `${d.client?.name || ""} · pediu ${d.solicitante_nome}`, quem: "—",
        due: d.prazo_desejado ? d.prazo_desejado.slice(0, 10) : null,
        atrasado: !!(d.prazo_desejado && d.prazo_desejado.slice(0, 10) < hoje),
        link: "/demandas", ord: 2,
      });
    });
    return out.sort((a, b) => (a.ord - b.ord) || (a.due || "9999").localeCompare(b.due || "9999"));
  }, [coordena, deliverables, alteracoes, demandas, profiles, hoje]);

  // O contador conta o que é MEU pra resolver — não o que espera outra
  // pessoa. Antes somava tudo: no print da Maiara dizia "8 pra resolver" com
  // 3 na tela, e as 8 eram peças paradas com o cliente. Contador que promete
  // trabalho inexistente é ruído com cara de cobrança.
  // Lead vencido é trabalho DELE hoje, então conta junto — é o número que
  // cobra. Gravação não entra: é compromisso marcado, não pendência.
  const total = itens.filter((i) => i.tipo !== "cliente").length + leadsPraTocar.length;

  // "Tudo em dia" tem que significar mesa vazia DE VERDADE. Como esse ramo
  // substitui todos os blocos, quem tivesse só gravações — ou, agora, só leads
  // pra tocar — via "Tudo em dia" com trabalho na tela e os blocos nem
  // renderizavam.
  const mesaVazia = total === 0 && gravacoes.length === 0;

  // FILA ÚNICA. As 4 seções viraram uma lista só: a ordem JÁ é a prioridade
  // (atrasado > te esperando > esta semana > em andamento), então repetir isso
  // em cabeçalhos era pedir pra pessoa ler 4 títulos pra achar 6 itens.
  const fila = useMemo(
    () => [...porBucket.atrasado, ...porBucket.espera, ...porBucket.semana, ...porBucket.andamento],
    [porBucket],
  );

  /**
   * OS BLOCOS. Cada um responde uma pergunta, e a soma deles é a fila antiga.
   *
   * O que muda em relação a "Agora / Depois": ali a ordem era a prioridade e
   * tudo dividia a mesma lista — o que estava comigo, o que esperava alguém e
   * o que estava com o cliente. Quem abria a mesa fazia a triagem de novo.
   *
   * "Pra eu editar" já inclui a peça em que eu entro só numa ETAPA: quem
   * decide é `quemEstaCom`, e ele é o dono da etapa quando existe.
   */
  const praEditar = useMemo(() => fila.filter((it) => it.tipo === "editar"), [fila]);
  const praAprovar = useMemo(() => fila.filter((it) => it.tipo === "aprovar" || it.tipo === "enviar"), [fila]);
  const comCliente = useMemo(() => fila.filter((it) => it.tipo === "cliente"), [fila]);
  const outras = useMemo(() => fila.filter((it) => it.tipo === "tarefa" || it.tipo === "demanda"), [fila]);

  /**
   * PARADO ESPERANDO ALGUÉM — com quantos dias de parado.
   *
   * O que está na mão de outra pessoa não é tarefa sua, mas some se ficar
   * misturado na fila. Aqui vira lista de cobrança, ordenada pelo que está
   * parado há mais tempo.
   */
  const travados = useMemo(() => {
    if (!user?.id) return [] as any[];
    const out: any[] = [];
    const eu = user.id;
    // Quem já está no destaque ou na fila não repete aqui — ver a mesma peça
    // em dois lugares faz a contagem mentir.
    // Não repete o que já está em "Pra eu editar" / "Pra eu aprovar": ver a
    // mesma peça em dois blocos faz a contagem mentir.
    const jaNoTopo = new Set([...praEditar, ...praAprovar].map((i) => i.d?.id).filter(Boolean));
    deliverables.forEach((d: any) => {
      if (jaNoTopo.has(d.id)) return;
      const ctx = d.project?.client_name || d.project?.name || "";
      const link = `/projetos/${d.project?.id}/entregaveis/${d.id}`;
      const dias = diasParado(d.updated_at);
      const base = { key: `tr-${d.id}`, titulo: d.titulo, contexto: ctx, link, dias, d };
      if (d.aprovado_cliente_em && ATIVO(d.status)) {
        out.push({ ...base, quem: "cliente aprovou", falta: "falta finalizar", dias: diasParado(d.aprovado_cliente_em) });
      } else if (d.status === "com_cliente" && podeCliente) {
        // Só o nome do CLIENTE aqui — o contexto cai pro nome do projeto quando
        // o cliente não está preenchido, e "com #20261802_CAPTACOES..." não é
        // frase que alguém leia.
        out.push({ ...base, quem: `com ${d.project?.client_name || "o cliente"}`, falta: "sem resposta",
          item: itens.find((i) => i.d?.id === d.id && i.tipo === "cliente") });
      } else if (["revisao", "revisao_n1", "revisao_n2"].includes(d.status) && d.responsavel_id === eu) {
        const aprovador = d.status === "revisao_n2"
          ? (d.project?.aprovador_n2_id ?? settings?.nivel2_user_id)
          : (d.project?.aprovador_n1_id ?? settings?.nivel1_user_id);
        out.push({ ...base, quem: `esperando ${nomeDe(aprovador)}`, falta: "aprovação" });
      }
    });
    // Mexeu hoje não está parado.
    return out.filter((t) => t.dias >= 1).sort((a, b) => b.dias - a.dias);
  }, [deliverables, itens, praEditar, praAprovar, user?.id, podeCliente, settings, profiles]);
  /**
   * "Vai entrar pra você": peça em que EU sou o responsável e que está na mão
   * de outra pessoa — etapa anterior ou revisão. Não é tarefa minha hoje, mas
   * volta pra mim, e saber disso é o que evita a surpresa de sexta.
   *
   * O que está com o CLIENTE sai daqui: tem bloco próprio, com as ações de
   * cobrar retorno.
   */
  const vaiEntrar = useMemo(
    () => travados.filter((t: any) => t.item?.tipo !== "cliente"),
    [travados],
  );

  const [aba, setAba] = useState<"minha" | "time">("minha");

  /**
   * A fila começa FECHADA.
   *
   * No print do Djêisson, "Pra eu editar · 11" tinha 3 itens da semana e 8 de
   * setembro. Os 8 empurravam pra baixo o bloco "Pra eu aprovar" — que custa
   * minutos e destrava OUTRA pessoa. Fila é o que ainda não é problema:
   * aparece o número e a primeira data, e abre num clique.
   */
  const [filaAberta, setFilaAberta] = useState(false);


  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // 6xl e não 4xl: duas colunas em 896px espremem as duas. A largura extra só
  // vale a partir de lg — abaixo disso o grid empilha e a leitura continua
  // sendo de coluna única.
  return (
    <div className="mx-auto max-w-6xl space-y-4 py-6">
      {/* Cabeçalho enxuto: o nome da tela e quanta coisa tem. O subtítulo
          explicativo saiu — quem abre a mesa já sabe pra que ela serve. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Minha mesa</h1>
        <div className="flex items-center gap-3 text-sm">
          {porBucket.atrasado.length > 0 && (
            <span className="font-medium text-destructive">{porBucket.atrasado.length} atrasado</span>
          )}
          <span className="text-muted-foreground">{total} pra resolver</span>
          {coordena && (
            <button
              onClick={() => setAba(aba === "minha" ? "time" : "minha")}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                aba === "time" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              Time ({sistema.length})
            </button>
          )}
        </div>
      </div>

      {/* O resumo da IA vira UMA linha — sem card, sem ícone, sem cabeçalho. */}
      {/* Antes do resto: de nada adianta a mesa priorizar bem se a pessoa não
          é avisada de nada. */}
      <AvisoPushDesligado />
      <ResumoDoDia />
      <MuralAvisos />

      {aba === "time" && coordena ? (
        <TeamPanel itens={sistema} hoje={hoje} />
      ) : mesaVazia ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Sparkles className="h-8 w-8 text-success" />
            <p className="text-base font-medium text-foreground">Tudo em dia</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ---- BLOCOS. Cada um responde uma pergunta diferente ----
              Antes era uma fila só ("Agora" / "Depois") com tudo misturado:
              o que estava comigo, o que esperava aprovação e o que estava com
              o cliente competiam pela mesma leitura. O desenho aqui é o que o
              Djêisson descreveu — o que é MEU em destaque, e o resto separado
              por quem está segurando. */}

          {/* BLOCOS. Djêisson (12/08), sobre a primeira tentativa: "ficou uma
              merda hein? cortou as informações, ficou uma tira só do lado...
              não era isso! crie literalmente blocos".

              Ele tinha razão duas vezes. O erro técnico: filho de grid tem
              `min-width: auto`, então a coluna não encolhia abaixo do conteúdo
              e o título vazava pra fora da tela em vez de truncar — daí o
              `min-w-0` em cada bloco. O erro de julgamento foi pior: validei o
              desenho num mock com 3 itens curtos, e a tela real tinha 9 com
              títulos longos.

              Agora cada seção é uma CAIXA fechada, de largura igual, com
              cabeçalho e contagem próprios. Duas por linha; em tela estreita,
              uma. A ordem é a da urgência: editar, aprovar, e o resto. */}
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <Bloco titulo="Pra eu editar" n={praEditar.length} tom="editar">
              {/* Subdividido por prazo: dez itens numa lista só faziam os três
                  atrasados sumirem entre os que vencem em setembro. */}
              {FAIXAS.map((f) => {
                const desta = praEditar.filter((it) => faixaDe(it, hoje) === f.id);
                if (!desta.length) return null;

                // A fila fechada: só o número e a primeira data. É o que devolve
                // a tela pro que precisa de decisão hoje.
                if (f.id === "fila" && !filaAberta) {
                  const primeira = desta.map((i) => i.due).filter(Boolean).sort()[0];
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFilaAberta(true)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      Na fila · {desta.length}
                      {primeira && (
                        <span className="truncate text-muted-foreground/70">
                          — a partir de {new Date(primeira + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </button>
                  );
                }

                return (
                  <div key={f.id}>
                    <SubTitulo
                      barra={f.barra}
                      titulo={f.titulo}
                      n={desta.length}
                      aberto={f.id === "fila" ? true : undefined}
                      onToggle={f.id === "fila" ? () => setFilaAberta(false) : undefined}
                    />
                    {desta.map((it) => (
                      <ItemRow
                        key={it.key} it={it} hoje={hoje} busy={busy === it.key}
                        faixa={f.id}
                        rodando={sessao?.deliverable_id === it.d?.id} onAgir={agir}
                      />
                    ))}
                  </div>
                );
              })}
            </Bloco>

            <Bloco titulo="Pra eu aprovar" n={praAprovar.length} tom="aprovar">
              {praAprovar.map((it) => (
                <ItemRow key={it.key} it={it} hoje={hoje} busy={busy === it.key}
                  rodando={sessao?.deliverable_id === it.d?.id} onAgir={agir} />
              ))}
            </Bloco>

            <Bloco titulo="Outras tarefas" n={outras.length}>
              {outras.map((it) => (
                <ItemRow key={it.key} it={it} hoje={hoje} busy={busy === it.key}
                  rodando={sessao?.deliverable_id === it.d?.id} onAgir={agir} />
              ))}
            </Bloco>

            {/* Gravações: o que não dá pra remarcar de manhã. */}
            <Bloco titulo="Gravações" n={gravacoes.length}>
              {gravacoes.map((g: any) => (
                <div key={g.id} className="flex min-w-0 items-center gap-3 border-b border-border/40 px-4 py-2 last:border-0">
                  <span className="w-14 shrink-0 text-xs font-medium text-foreground">
                    {new Date(g.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={g.titulo}>
                    {g.titulo}
                    {g.hora_inicio && <span className="ml-2 text-xs text-muted-foreground">{String(g.hora_inicio).slice(0, 5)}</span>}
                  </span>
                  <Link to="/saidas" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
                    ver <ChevronRight className="inline h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </Bloco>

            {/* Leads pra tocar. Cor só no que decide: barra vermelha no atrasado,
                âmbar no que vence hoje — a mesma linguagem das faixas de cima. */}
            <Bloco titulo="Leads pra tocar" n={leadsPraTocar.length}>
              {leadsPraTocar.map((l: any) => {
                const dias = diasDeAtraso(l.proximo_toque, hoje);
                const temp = TEMPERATURAS.find((t) => t.v === l.temperatura);
                return (
                  <Link
                    key={l.id} to={`/leads/${l.id}`}
                    className="flex min-w-0 items-center gap-3 border-b border-border/40 px-4 py-2 last:border-0 hover:bg-sidebar-accent/40"
                  >
                    <span className={`h-8 w-[3px] shrink-0 rounded-full ${dias > 0 ? "bg-destructive" : "bg-warning"}`} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={`${l.nome}${l.motivo_toque ? ` — ${l.motivo_toque}` : ""}`}>
                      {l.nome}
                      {l.empresa && <span className="ml-2 text-xs text-muted-foreground">{l.empresa}</span>}
                    </span>
                    {temp && (
                      <span className={`hidden shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium lg:inline ${temp.chip}`}>
                        {temp.l}
                      </span>
                    )}
                    <span className={`shrink-0 text-right text-xs ${dias > 0 ? "font-medium text-destructive" : "text-warning"}`}>
                      {rotuloAtraso(l.proximo_toque, hoje)}
                    </span>
                  </Link>
                );
              })}
            </Bloco>

            <Bloco titulo="Com o cliente" n={comCliente.length}>
              <ListaComMais itens={comCliente} render={(it: any) => (
                <ItemRow key={it.key} it={it} hoje={hoje} busy={busy === it.key}
                  rodando={sessao?.deliverable_id === it.d?.id} onAgir={agir} />
              )} />
            </Bloco>

            {/* Ainda não é seu, mas vai ser: peça em que você é o responsável e
                que está na mão de outra pessoa (etapa anterior ou revisão). */}
            <Bloco titulo="Vai entrar pra você" n={vaiEntrar.length}>
              <ListaComMais itens={vaiEntrar} render={(t: any) => (
                <div key={t.key} className="flex min-w-0 items-center gap-3 border-b border-border/40 px-4 py-2 last:border-0">
                  <Link to={t.link} className="min-w-0 flex-1 truncate text-sm text-foreground" title={`${t.titulo} — ${t.quem} · ${t.falta}`}>
                    {t.d?.codigo && (
                      <span className="mr-2 font-mono text-[11px] text-muted-foreground">{t.d.codigo}</span>
                    )}
                    {t.titulo}
                  </Link>
                  <span className="hidden shrink-0 truncate text-right text-xs text-muted-foreground lg:block">
                    {t.quem}
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    há {t.dias}d
                  </span>
                </div>
              )} />
            </Bloco>
          </div>

        </>
      )}
    </div>
  );
}

/**
 * Botão de cronômetro da linha. Rodar hora é o ato central da produtora e
 * estava a três cliques daqui — e o "Editar" já ligava o cronômetro sem dizer.
 * Agora o estado é visível e dá pra ligar/desligar sem mexer na etapa.
 */
function BotaoCronometro({ rodando, busy, onClick }: { rodando: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={rodando ? "Parar e lançar as horas" : "Rastrear horas nesta peça"}
      className={`shrink-0 rounded p-1.5 disabled:opacity-50 ${
        rodando ? "text-warning hover:bg-warning/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {rodando ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * O item que a tela escolheu como "agora": grande, com o MOTIVO da escolha
 * escrito. Sem o motivo, destacar vira palpite — a pessoa não sabe se pode
 * confiar na ordem.
 */
/**
 * Um bloco da mesa. Some quando está vazio — bloco vazio com título é uma
 * linha a mais pra ler dizendo que não há nada pra ler.
 */
function Bloco({ titulo, n, tom, children }: {
  titulo: string; n: number; tom?: "editar" | "aprovar"; children: React.ReactNode;
}) {
  if (!n) return null;
  // Borda colorida só nos dois que exigem ação hoje. O resto é caixa neutra —
  // cinco molduras coloridas seria a poluição que ele já barrou duas vezes.
  const borda = tom === "aprovar" ? "border-primary/40"
    : tom === "editar" ? "border-warning/30"
    : "border-border/60";
  const ponto = tom === "aprovar" ? "bg-primary" : tom === "editar" ? "bg-warning" : "";
  return (
    // `min-w-0` é o conserto do bug: filho de grid tem min-width auto, não
    // encolhe abaixo do conteúdo, e o título longo vazava pra fora da tela em
    // vez de truncar. `overflow-hidden` segura o resto.
    <section className={`min-w-0 overflow-hidden rounded-xl border bg-card/40 ${borda}`}>
      <header className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
        {ponto && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ponto}`} />}
        <h3 className="truncate text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
          {titulo}
        </h3>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{n}</span>
      </header>
      {children}
    </section>
  );
}

/**
 * Lista que mostra os primeiros e esconde o resto atrás de "mais N".
 *
 * "Com o cliente" tem 9 itens na mesa do Djêisson. Nenhum deles pede ação
 * dele agora — são acompanhamento. Deixar os 9 abertos faz o bloco crescer
 * três vezes mais que os que exigem decisão, e a tela volta a ser uma rolagem.
 */
function ListaComMais({ itens, limite = 5, render }: {
  itens: any[]; limite?: number; render: (x: any) => React.ReactNode;
}) {
  const [tudo, setTudo] = useState(false);
  const visiveis = tudo ? itens : itens.slice(0, limite);
  return (
    <>
      {visiveis.map(render)}
      {itens.length > limite && (
        <button
          onClick={() => setTudo(!tudo)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${tudo ? "rotate-90" : ""}`} />
          {tudo ? "mostrar menos" : `mais ${itens.length - limite}`}
        </button>
      )}
    </>
  );
}

/** Cabeçalho de faixa DENTRO do bloco (Vencido / Hoje e esta semana / Na fila). */
function SubTitulo({ barra, titulo, n, aberto, onToggle }: {
  barra: string; titulo: string; n: number; aberto?: boolean; onToggle?: () => void;
}) {
  const conteudo = (
    <>
      {onToggle
        ? <ChevronRight className={`h-3 w-3 shrink-0 ${aberto ? "rotate-90" : ""}`} />
        : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${barra}`} />}
      {titulo} · {n}
    </>
  );
  const cls = "flex items-center gap-2 px-4 pb-1 pt-2.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground";
  return onToggle
    ? <button onClick={onToggle} className={`${cls} hover:text-foreground`}>{conteudo}</button>
    : <p className={cls}>{conteudo}</p>;
}

/**
 * Uma linha da mesa. Densa, e com COR SÓ ONDE ELA DECIDE ALGO.
 *
 * Antes cada item era um cartão de ~100px com um botão laranja sólido. Oito
 * itens viravam oito botões idênticos gritando junto: cor em tudo é cor em
 * nada, e o atrasado se perdia no meio do resto. Agora:
 *
 *   · barra de 3px na lateral — vermelha no vencido, âmbar no que vence esta
 *     semana, NADA na fila. É a marca que o olho pega descendo a lista;
 *   · o prazo herda a mesma cor, e é a única palavra colorida da linha;
 *   · o botão principal é SÓLIDO só no vencido. No resto ele existe em
 *     contorno — continua a um clique, mas para de disputar atenção com o
 *     que está pegando fogo.
 */
function ItemRow({ it, hoje, busy, rodando, onAgir, faixa }: {
  it: Item; hoje: string; busy: boolean; rodando: boolean;
  onAgir: (kind: string, it: Item) => void; faixa?: Faixa;
}) {
  const atrasado = it.atrasado;
  const botoes = botoesDoItem(it);
  const principal = botoes[0];
  const extras = botoes.slice(1);
  const urgente = faixa === "vencido" || (!faixa && atrasado);

  const prazo = it.due
    ? it.due === hoje
      ? "hoje"
      : new Date(it.due + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : "";

  return (
    <div className="flex items-center gap-3 border-b border-border/40 py-2 pr-4 last:border-0 hover:bg-sidebar-accent/40">
      {/* A barra é a cor: 3px na lateral, e só quando significa algo. */}
      <span className={`h-8 w-[3px] shrink-0 rounded-r ${
        urgente ? "bg-destructive" : faixa === "agora" ? "bg-warning" : "bg-transparent"
      }`} />

      <Link to={it.link} className="min-w-0 flex-1 truncate text-sm text-foreground" title={it.titulo}>
        {/* O código na frente do título: é por ele que a peça é procurada no
            Drive, no DaVinci e na conversa com o cliente. Fica em mono e
            apagado — informação de busca, não de leitura. Só entregável tem
            código; tarefa e demanda passam batido. */}
        {it.d?.codigo && (
          <span className="mr-2 font-mono text-[11px] text-muted-foreground">{it.d.codigo}</span>
        )}
        {it.d?.etapa_atual && (
          <span className="mr-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {it.d.etapa_atual}
          </span>
        )}
        {it.titulo}
        {it.nota && <span className="ml-2 text-xs text-muted-foreground">↻ {it.nota}</span>}
      </Link>

      {/* O cliente some antes do título: num bloco de ~570px ele é o primeiro
          a sobrar. O título fica (é o que identifica a peça) e o contexto
          continua no `title` da linha. */}
      <span className="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground xl:block" title={it.contexto}>
        {it.contexto}
      </span>

      <span className={`w-16 shrink-0 text-right text-xs ${
        urgente ? "font-medium text-destructive"
          : faixa === "agora" ? "font-medium text-warning"
          : "text-muted-foreground"
      }`}>
        {prazo}
      </span>

      <div className="flex shrink-0 items-center justify-end gap-1">
        {it.d && <BotaoCronometro rodando={rodando} busy={busy} onClick={() => onAgir("cronometro", it)} />}
        {principal ? (
          <>
            {/* Sólido só no AGORA. Aqui embaixo o botão existe mas não grita —
                era isso que fazia os 11 itens parecerem igualmente urgentes. */}
            <Button
              size="sm"
              variant={urgente ? "default" : "outline"}
              disabled={busy}
              onClick={() => onAgir(principal.kind, it)}
              className="h-7 px-2.5 text-xs"
            >
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {principal.label}
            </Button>
            {/* A 2ª ação (Ajuste, Alteração) vira ícone: existe, mas não
                compete com a principal nem gasta uma palavra na linha. */}
            {extras.map((b) => (
              <button
                key={b.kind}
                disabled={busy}
                title={b.label}
                onClick={() => onAgir(b.kind, it)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <b.Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </>
        ) : (
          <Link to={it.link} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {it.acao} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
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
              const atrasado = it.atrasado;
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
