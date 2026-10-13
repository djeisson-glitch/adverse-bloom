import type { Tables } from "@/integrations/supabase/types";

// Compatibilidade de leitura; não reescreve o histórico nem dispara automações.
export function etapaComercial(stage: string): string {
  const aliases: Record<string, string> = {
    contato: "lead", contato_inicial: "lead", diagnostico: "lead",
    orcamento: "elaboracao", orcamento_em_elaboracao: "elaboracao",
    ganho: "aceite", fechamento: "aceite",
  };
  return aliases[stage] || stage;
}
export function negocioAberto(stage: string) {
  return !["aceite", "fechado_ganho", "perdido"].includes(etapaComercial(stage));
}
export type CrmLead = Tables<"leads"> & { motivo_toque?: string | null };
export type CrmActivity = {
  id: string; source: "lead" | "task" | "followup";
  title: string; context: string; due: string | null; owner: string | null;
  dealId: string | null; clientId: string | null; href: string;
};
export function agendaComercial(
  leads: CrmLead[], tasks: Tables<"tasks">[], followups: Tables<"follow_ups">[],
  deals: {id: string; title: string; client?: {name: string} | null}[],
): CrmActivity[] {
  const porId = new Map(deals.map(d => [d.id, d]));
  const context = (id: string | null) => {
    const d = id ? porId.get(id) : undefined;
    return d ? [d.title, d.client?.name].filter(Boolean).join(" · ") : "Acompanhamento comercial";
  };
  return [
    ...leads.filter(l => !["convertido", "descartado"].includes(l.status)).map(l => ({
      id: l.id, source: "lead" as const, title: l.motivo_toque || `Conversar com ${l.nome}`,
      context: [l.nome, l.empresa].filter(Boolean).join(" · "), due: l.proximo_toque,
      owner: l.responsavel_id, dealId: l.deal_id, clientId: l.client_id, href: `/leads/${l.id}`,
    })),
    // Tarefas de produção não pertencem à agenda comercial.
    ...tasks.filter(t => t.deal_id && !t.project_id && !t.completed).map(t => ({
      id: t.id, source: "task" as const, title: t.title, context: context(t.deal_id),
      due: t.due_date, owner: t.assigned_user_id, dealId: t.deal_id, clientId: t.client_id,
      href: `/orcamentos/${t.deal_id}`,
    })),
    ...followups.filter(f => f.status === "pendente").map(f => ({
      id: f.id, source: "followup" as const, title: f.descricao || "Retomar contato com o cliente",
      context: context(f.deal_id), due: f.data_prevista, owner: f.responsavel_id,
      dealId: f.deal_id, clientId: null, href: f.deal_id ? `/orcamentos/${f.deal_id}` : "/follow-ups",
    })),
  ].sort((a,b) => (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title));
}
export function prazoAtividade(due: string | null, today: string) {
  if (!due) return "sem_data";
  if (due < today) return "atrasado";
  return due === today ? "hoje" : "proximo";
}
export function negociosSemAtividade<T extends {id: string; stage: string}>(deals: T[], activities: CrmActivity[]) {
  const agendados = new Set(activities.filter(a => a.due).map(a => a.dealId));
  return deals.filter(d => negocioAberto(d.stage) && !agendados.has(d.id));
}
