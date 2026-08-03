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
        .select("id, titulo, status, formato, data_entrega, responsavel_id, retrabalho, rev_ajuste_pendente, revisoes_internas, aprovado_n1_em, aprovado_n2_em, aprovado_cliente_em, updated_at, etapa_atual, project:projects(id, numero, name, client_name, aprovador_n1_id, aprovador_n2_id, envio_cliente_id)")
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

  const total = itens.length;

  // FILA ÚNICA. As 4 seções viraram uma lista só: a ordem JÁ é a prioridade
  // (atrasado > te esperando > esta semana > em andamento), então repetir isso
  // em cabeçalhos era pedir pra pessoa ler 4 títulos pra achar 6 itens.
  const fila = useMemo(
    () => [...porBucket.atrasado, ...porBucket.espera, ...porBucket.semana, ...porBucket.andamento],
    [porBucket],
  );

  /**
   * O AGORA. A tela escolhe de 1 a 3 coisas e diz por quê.
   *
   * Antes os 11 itens vinham com o mesmo botão laranja: a prioridade existia no
   * código (a ordem da fila) e era invisível na tela — então quem abria a mesa
   * fazia a triagem de novo, na mão. Se nada é urgente a seção não inventa
   * urgência: mostra só o próximo e diz que não há nada pegando fogo.
   */
  const { agora, semUrgencia } = useMemo(() => {
    // "cliente" é coisa parada esperando outra pessoa — tem seção própria.
    const candidatos = fila.filter((it) => it.tipo !== "cliente");
    const urgentes = candidatos.filter((it) => urgencia(it, hoje) <= 2).slice(0, 3);
    if (urgentes.length) return { agora: urgentes, semUrgencia: false };
    return { agora: candidatos.slice(0, 1), semUrgencia: true };
  }, [fila, hoje]);

  const resto = useMemo(() => {
    const noTopo = new Set(agora.map((i) => i.key));
    return fila.filter((it) => !noTopo.has(it.key) && it.tipo !== "cliente");
  }, [fila, agora]);

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
    const jaNoTopo = new Set(agora.map((i) => i.d?.id).filter(Boolean));
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
  }, [deliverables, itens, agora, user?.id, podeCliente, settings, profiles]);
  const [aba, setAba] = useState<"minha" | "time">("minha");

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-6">
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
      ) : total === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Sparkles className="h-8 w-8 text-success" />
            <p className="text-base font-medium text-foreground">Tudo em dia</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ---- AGORA: a tela decide, e diz por quê ---- */}
          {agora.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {semUrgencia ? "Nada urgente — o próximo é" : "Agora"}
              </p>
              {agora.map((it) => (
                <CardAgora
                  key={it.key} it={it} hoje={hoje} busy={busy === it.key}
                  rodando={sessao?.deliverable_id === it.d?.id} onAgir={agir}
                />
              ))}
            </div>
          )}

          {/* ---- Depois: mesma fila de antes, quieta ---- */}
          {resto.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Depois · {resto.length}
              </p>
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  {resto.map((it) => (
                    <ItemRow
                      key={it.key} it={it} hoje={hoje} busy={busy === it.key}
                      rodando={sessao?.deliverable_id === it.d?.id} onAgir={agir}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ---- Parado esperando alguém ---- */}
          {travados.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Parado esperando alguém · {travados.length}
              </p>
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  {travados.map((t) => (
                    <div key={t.key} className="flex items-center gap-3 border-b border-border/40 px-4 py-2 last:border-0 hover:bg-sidebar-accent/40">
                      <Link to={t.link} className="min-w-0 flex-1 truncate text-sm text-foreground" title={t.titulo}>
                        {t.titulo}
                      </Link>
                      <span className="hidden w-52 shrink-0 truncate text-right text-xs text-muted-foreground sm:block">
                        {t.quem} · {t.falta}
                      </span>
                      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                        há {t.dias} {t.dias === 1 ? "dia" : "dias"}
                      </span>
                      <div className="flex w-[190px] shrink-0 items-center justify-end gap-1">
                        {t.item ? botoesDoItem(t.item).map((b, i) => (
                          <Button
                            key={b.kind} size="sm" variant={i === 0 ? "default" : "ghost"}
                            disabled={busy === t.item.key}
                            onClick={() => agir(b.kind, t.item)}
                            className={`h-7 px-2.5 text-xs ${i === 0 ? "" : "text-muted-foreground"}`}
                          >
                            {b.label}
                          </Button>
                        )) : null}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
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
function CardAgora({ it, hoje, busy, rodando, onAgir }: {
  it: Item; hoje: string; busy: boolean; rodando: boolean; onAgir: (kind: string, it: Item) => void;
}) {
  const atrasado = it.atrasado;
  const botoes = botoesDoItem(it);
  return (
    <Card className={`glass-card ${atrasado ? "border-destructive/40" : ""}`}>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <div className="min-w-0 flex-1">
          <Link to={it.link} className="block truncate text-base font-medium text-foreground hover:underline" title={it.titulo}>
            {it.titulo}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {/* Etapa como tag: quem bate o olho sabe em que mão a peça está. */}
            {it.d?.etapa_atual && (
              <span className="mr-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {it.d.etapa_atual}
              </span>
            )}
            {it.contexto}
            <span className={atrasado ? "font-medium text-destructive" : ""}> · {motivoDoTopo(it, hoje)}</span>
            {it.nota && <span> · {it.nota}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {it.d && <BotaoCronometro rodando={rodando} busy={busy} onClick={() => onAgir("cronometro", it)} />}
          {botoes.map((b, i) => (
            <Button
              key={b.kind} size="sm" disabled={busy}
              variant={i === 0 ? "default" : "ghost"}
              onClick={() => onAgir(b.kind, it)}
              className={`h-8 px-3 text-xs ${i === 0 ? b.cls : "text-muted-foreground"}`}
            >
              {busy && i === 0 ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {b.label}
            </Button>
          ))}
          <Link to={it.link} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Abrir">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * UMA LINHA por item: marca, título, cliente, prazo, ação.
 *
 * O que saiu e por quê: o ícone de status (a ação à direita já diz o que
 * fazer), a pílula de etapa (idem), a linha de contexto separada e o
 * cabeçalho de seção. Sobrou o que responde "o que eu faço agora".
 */
function ItemRow({ it, hoje, busy, rodando, onAgir }: { it: Item; hoje: string; busy: boolean; rodando: boolean; onAgir: (kind: string, it: Item) => void }) {
  const atrasado = it.atrasado;
  const botoes = botoesDoItem(it);
  const principal = botoes[0];
  const extras = botoes.slice(1);

  const prazo = it.due
    ? it.due === hoje
      ? "hoje"
      : new Date(it.due + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : "";

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-4 py-2 last:border-0 hover:bg-sidebar-accent/40">
      {/* Marca de atraso ocupa largura fixa: as linhas ficam alinhadas mesmo
          quando só algumas têm a marca. */}
      <span className="w-3 shrink-0 text-center text-sm font-bold text-destructive">
        {atrasado ? "!" : ""}
      </span>

      <Link to={it.link} className="min-w-0 flex-1 truncate text-sm text-foreground" title={it.titulo}>
        {it.d?.etapa_atual && (
          <span className="mr-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {it.d.etapa_atual}
          </span>
        )}
        {it.titulo}
        {it.nota && <span className="ml-2 text-xs text-muted-foreground">↻ {it.nota}</span>}
      </Link>

      <span className="hidden w-40 shrink-0 truncate text-right text-xs text-muted-foreground sm:block" title={it.contexto}>
        {it.contexto}
      </span>

      <span className={`w-16 shrink-0 text-right text-xs ${atrasado ? "font-medium text-destructive" : "text-muted-foreground"}`}>
        {prazo}
      </span>

      <div className="flex w-[190px] shrink-0 items-center justify-end gap-1">
        {it.d && <BotaoCronometro rodando={rodando} busy={busy} onClick={() => onAgir("cronometro", it)} />}
        {principal ? (
          <>
            {/* Sólido só no AGORA. Aqui embaixo o botão existe mas não grita —
                era isso que fazia os 11 itens parecerem igualmente urgentes. */}
            <Button
              size="sm"
              variant="outline"
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
