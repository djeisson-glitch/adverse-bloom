import type { ModuleId } from "@/hooks/usePermissions";

/**
 * Acessos geridos por GRUPO (os mesmos grupos do menu lateral), pra o painel
 * de Time não virar 28 cliques. Ligar/desligar um grupo concede/revoga todos
 * os módulos dele de uma vez.
 *
 * `dinheiro: true` = o grupo abre dados financeiros de verdade (a RLS respeita).
 * Por isso esses vêm marcados no painel.
 */
export type AccessGroup = { id: string; label: string; dinheiro: boolean; hint: string; modules: ModuleId[] };

/** Sempre ligado pra qualquer pessoa da equipe — não aparece como toggle. */
export const BASE_MODULES: ModuleId[] = ["inicio", "minha_mesa"];

export const ACCESS_GROUPS: AccessGroup[] = [
  { id: "comercial",  label: "Comercial",  dinheiro: true,  hint: "Demandas, leads, orçamentos, clientes, follow-ups", modules: ["demandas", "leads", "orcamentos", "clientes", "follow_ups"] },
  { id: "producao",   label: "Produção",   dinheiro: false, hint: "Projetos, pauta, pós-produção, calendário",         modules: ["projetos", "pauta", "pos_producao", "calendario"] },
  { id: "tempo",      label: "Tempo",      dinheiro: false, hint: "Horas, timesheet, capacidade, planejamento, previsão", modules: ["horas", "timesheet", "capacidade", "planejamento", "previsao"] },
  { id: "financeiro", label: "Financeiro", dinheiro: true,  hint: "Faturamento, fechamento, contas/fees, relatórios, DRE", modules: ["faturamento", "fechamento", "contas_fees", "relatorios", "financeiro"] },
  { id: "gestao",     label: "Gestão",     dinheiro: true,  hint: "Time e fornecedores",                               modules: ["time", "fornecedores"] },
];

/**
 * Módulos que dependem de "ver dinheiro" na RLS. Espelha a lista da função
 * pode_ver_dinheiro no banco — conceder qualquer um destes abre os dados
 * financeiros de verdade. (Mantenha as duas em sincronia.)
 */
export const MONEY_MODULES: ModuleId[] = [
  "demandas", "leads", "orcamentos", "clientes", "follow_ups", "crm", "propostas",
  "faturamento", "fechamento", "contas_fees", "relatorios", "financeiro", "fornecedores",
];
