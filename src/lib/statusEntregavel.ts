import {
  Clock, Film, Pause, UserCheck, ThumbsUp, ExternalLink, RefreshCw, CheckCircle2,
  type LucideIcon,
} from "lucide-react";

/**
 * Linguagem visual do status do entregável — FONTE ÚNICA.
 *
 * O card do entregável, a Minha mesa e a lista de entregáveis do projeto usam o
 * MESMO ícone + cor por etapa, pra bater o olho e saber onde o vídeo está sem
 * ler texto. Mudou aqui, muda em todo lugar.
 */

export const STATUS_ENTREGAVEL = [
  { id: "pendente", label: "Pendente", tone: "muted" },
  { id: "em_edicao", label: "Em edição", tone: "primary" },
  { id: "em_pausa", label: "Em pausa", tone: "muted" },
  { id: "revisao_n1", label: "Revisão N1", tone: "warning" },
  { id: "revisao_n2", label: "Revisão N2", tone: "warning" },
  { id: "revisao", label: "Revisão", tone: "warning" },
  { id: "pronto", label: "Pronto pra enviar", tone: "success" },
  { id: "com_cliente", label: "Com o cliente", tone: "info" },
  { id: "ajuste_solicitado", label: "Ajuste do cliente", tone: "destructive" },
  { id: "ajuste_interno", label: "Ajuste interno", tone: "destructive" },
  { id: "aprovado", label: "Aprovado", tone: "success" },
  { id: "entregue", label: "Entregue", tone: "success" },
] as const;

export const STATUS_ICON: Record<string, LucideIcon> = {
  pendente: Clock, em_edicao: Film, em_pausa: Pause,
  revisao_n1: UserCheck, revisao_n2: UserCheck, revisao: UserCheck,
  pronto: ThumbsUp, com_cliente: ExternalLink,
  ajuste_interno: RefreshCw, ajuste_solicitado: RefreshCw,
  aprovado: CheckCircle2, entregue: CheckCircle2,
};

export function iconeStatus(id: string): LucideIcon {
  return STATUS_ICON[id] || Clock;
}

export function statusTom(id: string): string {
  return STATUS_ENTREGAVEL.find((x) => x.id === id)?.tone || "muted";
}

/** Rótulo cru da etapa (sem nome de aprovador). */
export function statusLabel(id: string): string {
  return STATUS_ENTREGAVEL.find((s) => s.id === id)?.label || id;
}

/** Chip discreto (fundo /15) — pra listas densas. */
export function statusTone(id: string): string {
  return {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
    info: "bg-cyan-500/15 text-cyan-400",
    // Antes muted-foreground somia no fundo. Texto na cor do foreground lê bem.
    muted: "bg-foreground/10 text-foreground",
  }[statusTom(id)] || "bg-foreground/10 text-foreground";
}

/** Pílula FORTE (fundo /25 + borda) — o destaque da tela. */
export function statusPill(id: string): string {
  return {
    primary: "bg-primary/25 text-primary border-primary/50",
    warning: "bg-warning/25 text-warning border-warning/50",
    destructive: "bg-destructive/25 text-destructive border-destructive/50",
    success: "bg-success/25 text-success border-success/50",
    info: "bg-cyan-500/25 text-cyan-300 border-cyan-500/50",
    muted: "bg-foreground/15 text-foreground border-foreground/30",
  }[statusTom(id)] || "bg-foreground/15 text-foreground border-foreground/30";
}

/** Borda-esquerda colorida do card. */
export function statusBorda(id: string): string {
  return {
    primary: "border-l-primary", warning: "border-l-warning",
    destructive: "border-l-destructive", success: "border-l-success",
    info: "border-l-cyan-500", muted: "border-l-foreground/40",
  }[statusTom(id)] || "border-l-foreground/40";
}
