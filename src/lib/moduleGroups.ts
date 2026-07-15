import type { ModuleId } from "@/hooks/usePermissions";

/**
 * Acessos geridos por GRUPO (os mesmos grupos do menu lateral), pra o painel
 * de Time não virar 28 cliques. Ligar/desligar um grupo concede/revoga todos
 * os módulos dele de uma vez.
 *
 * `dinheiro: true` = o grupo abre dados financeiros de verdade (a RLS respeita).
 * Por isso esses vêm marcados no painel.
 */
export type AccessGroup = { id: string; section: string; label: string; dinheiro: boolean; hint: string; modules: ModuleId[] };

/** Sempre ligado pra qualquer pessoa da equipe — não aparece como toggle. */
export const BASE_MODULES: ModuleId[] = ["inicio", "minha_mesa"];

/**
 * Toggles agrupados por seção (os grupos do menu). Mais granular que os 5
 * grupos originais, mas sem chegar nos 28 módulos: subdivide onde faz diferença
 * (ver demanda sem ver preço, apontar horas sem ver planejamento, etc.).
 */
export const ACCESS_GROUPS: AccessGroup[] = [
  // Comercial
  { id: "demandas",     section: "Comercial",  label: "Demandas",              dinheiro: true,  hint: "As solicitações que chegam dos clientes", modules: ["demandas"] },
  { id: "orcamentos",   section: "Comercial",  label: "Orçamentos & Propostas", dinheiro: true, hint: "Orçar e enviar proposta",                modules: ["orcamentos", "propostas"] },
  { id: "clientes",     section: "Comercial",  label: "Clientes & Leads",      dinheiro: true,  hint: "Cadastro de clientes, leads, follow-ups", modules: ["clientes", "leads", "follow_ups"] },
  // Produção
  { id: "projetos",     section: "Produção",   label: "Projetos",              dinheiro: false, hint: "Projetos, calendário e pós-produção",     modules: ["projetos", "calendario", "pos_producao"] },
  { id: "pauta",        section: "Produção",   label: "Pauta",                 dinheiro: false, hint: "Coordenação do time (mesa coletiva)",     modules: ["pauta"] },
  // Tempo
  { id: "horas",        section: "Tempo",      label: "Minhas horas",          dinheiro: false, hint: "Apontar horas e timesheet",              modules: ["horas", "timesheet"] },
  { id: "planejamento", section: "Tempo",      label: "Planejamento da equipe", dinheiro: false, hint: "Capacidade, planejamento e previsão",   modules: ["capacidade", "planejamento", "previsao"] },
  // Financeiro
  { id: "faturamento",  section: "Financeiro", label: "Faturamento & Fechamento", dinheiro: true, hint: "Faturas e fechamento de projeto",     modules: ["faturamento", "fechamento"] },
  { id: "dre",          section: "Financeiro", label: "DRE & Relatórios",      dinheiro: true,  hint: "Financeiro profundo, contas/fees, relatórios", modules: ["financeiro", "relatorios", "contas_fees"] },
  // Gestão
  { id: "gestao",       section: "Gestão",     label: "Time & Fornecedores",   dinheiro: true,  hint: "Cadastro da equipe e fornecedores",       modules: ["time", "fornecedores"] },
];

/** Seções na ordem de exibição (cabeçalhos do painel de acessos). */
export const ACCESS_SECTIONS = ["Comercial", "Produção", "Tempo", "Financeiro", "Gestão"];

/**
 * Módulos que dependem de "ver dinheiro" na RLS. Espelha a lista da função
 * pode_ver_dinheiro no banco — conceder qualquer um destes abre os dados
 * financeiros de verdade. (Mantenha as duas em sincronia.)
 */
export const MONEY_MODULES: ModuleId[] = [
  "demandas", "leads", "orcamentos", "clientes", "follow_ups", "crm", "propostas",
  "faturamento", "fechamento", "contas_fees", "relatorios", "financeiro", "fornecedores",
];
