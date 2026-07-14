import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ModuleId =
  // Legado
  | "crm"
  | "orcamentos"
  | "financeiro"
  | "propostas"
  | "producao"
  | "agenda"
  // Execução (o que a equipe enxerga)
  | "inicio"
  | "minha_mesa"
  // Comercial
  | "demandas"
  | "leads"
  | "clientes"
  // Onda 0/1 — novos módulos
  | "projetos"
  | "fechamento"
  | "pos_producao"
  | "pauta"
  | "calendario"
  | "horas"
  | "timesheet"
  | "capacidade"
  | "planejamento"
  | "previsao"
  | "contas_fees"
  | "fornecedores"
  | "follow_ups"
  | "faturamento"
  | "relatorios"
  | "time"
  | "admin"
  | "portal";

export type PermissionLevel = "none" | "view" | "edit";

/** 5 papéis do Adverse OS Produtora (mantém legados admin/manager/operator por compat.) */
export type AppRole =
  | "admin"
  | "manager"    // legado ≈ admin
  | "operator"   // legado ≈ equipe
  | "produtor"
  | "equipe"
  | "edicao"
  | "cliente";

export const MODULES: { id: ModuleId; label: string; description: string }[] = [
  { id: "inicio", label: "Início", description: "Painel inicial" },
  { id: "minha_mesa", label: "Minha mesa", description: "Fila do editor e do aprovador" },
  { id: "demandas", label: "Demandas", description: "Solicitações que chegam pelos formulários" },
  { id: "leads", label: "Leads", description: "Entrada comercial" },
  { id: "clientes", label: "Clientes", description: "Cadastro e configuração dos clientes" },
  { id: "crm", label: "CRM / Comercial", description: "Pipeline de vendas, deals, clientes" },
  { id: "orcamentos", label: "Orçamentos", description: "Criar e gerenciar orçamentos" },
  { id: "financeiro", label: "Financeiro", description: "Fluxo de caixa, custos, contas a pagar, projeções" },
  { id: "propostas", label: "Propostas", description: "Gerar e enviar propostas aos clientes" },
  { id: "producao", label: "Produção", description: "Pipeline de produção dos projetos" },
  { id: "projetos", label: "Projetos", description: "Vistas Lista/Board/Calendário/Gantt dos projetos" },
  { id: "fechamento", label: "Fechamento", description: "Horas × custos × valor × margem por projeto" },
  { id: "pos_producao", label: "Pós-Produção", description: "Fila da equipe de edição" },
  { id: "pauta", label: "Pauta", description: "Tarefas agrupadas por pessoa/projeto" },
  { id: "calendario", label: "Calendário", description: "Prazos e entregas em vista mensal" },
  { id: "horas", label: "Horas", description: "Lançamento e timer de horas por projeto" },
  { id: "timesheet", label: "Timesheet", description: "Grid semanal de horas" },
  { id: "capacidade", label: "Capacidade", description: "Ocupação × capacidade da equipe" },
  { id: "planejamento", label: "Planejamento", description: "Alocação futura de horas" },
  { id: "previsao", label: "Previsão", description: "Pipeline ponderado vs. capacidade" },
  { id: "contas_fees", label: "Contas / Fees", description: "Contas guarda-chuva de fees recorrentes" },
  { id: "fornecedores", label: "Fornecedores", description: "Diretório interno de fornecedores/freelas" },
  { id: "follow_ups", label: "Follow-ups", description: "Agenda automática pós-ganho/perda" },
  { id: "faturamento", label: "Faturamento", description: "Emissão e acompanhamento de faturas" },
  { id: "relatorios", label: "Relatórios", description: "Funil, faturamento, rentabilidade" },
  { id: "agenda", label: "Agenda da Equipe", description: "Alocação de equipe e diárias de captação" },
  { id: "time", label: "Time", description: "Cadastro da equipe e apontamento da semana" },
  { id: "admin", label: "Admin", description: "Usuários, papéis, workflows, rate card" },
  { id: "portal", label: "Portal do Cliente", description: "Acompanhamento dos projetos pelo cliente" },
];

interface UserPermission {
  module: string;
  permission: PermissionLevel;
}

/**
 * Equipe / Edição = SÓ EXECUÇÃO. É uma allowlist: o que não estiver aqui é
 * negado. (Antes era blocklist — qualquer módulo novo nascia liberado.)
 * O mesmo recorte é imposto na RLS (pode_ver_dinheiro), então esconder o menu
 * é só conveniência: quem manda é o banco.
 */
const EQUIPE_MODULES: ModuleId[] = [
  "inicio",
  "projetos",
  "minha_mesa",
  "pauta",
  "calendario",
  "horas",
  "timesheet",
  "pos_producao",
];

export function usePermissions() {
  const { user } = useAuth();

  const { data: userRoles } = useQuery({
    queryKey: ["user_roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((r) => r.role as AppRole);
    },
  });

  const roles = userRoles ?? [];
  const isAdmin = roles.includes("admin") || roles.includes("manager");
  const isProdutor = roles.includes("produtor");
  const isEquipe = roles.includes("equipe") || roles.includes("operator");
  const isEdicao = roles.includes("edicao");
  const isCliente = roles.includes("cliente");

  const canSeeMoney = isAdmin || isProdutor;
  const canApontarHoras = isAdmin || isProdutor || isEquipe || isEdicao;

  const { data: permissions } = useQuery({
    queryKey: ["user_permissions", user?.id],
    enabled: !!user?.id && !isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_permissions")
        .select("module, permission")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as UserPermission[];
    },
  });

  /** Concessão extra que o admin deu pra essa pessoa (user_permissions). */
  const concedido = (module: ModuleId, level: PermissionLevel): boolean => {
    const perm = permissions?.find((p) => p.module === module);
    if (!perm) return false;
    if (level === "edit") return perm.permission === "edit";
    return perm.permission === "view" || perm.permission === "edit";
  };

  const can = (module: ModuleId, level: PermissionLevel = "view"): boolean => {
    if (isAdmin) return true;

    // Cliente: só o próprio portal.
    if (isCliente) return module === "portal";

    // Produtor: tudo, menos administrar o sistema (Admin em modo edição).
    if (isProdutor) return !(module === "admin" && level === "edit");

    // Equipe / Edição: allowlist de execução + o que o admin conceder à mão.
    if (isEquipe || isEdicao) {
      return EQUIPE_MODULES.includes(module) || concedido(module, level);
    }

    // Sem papel reconhecido: nega (fail-closed).
    return concedido(module, level);
  };

  return {
    can,
    isAdmin,
    isProdutor,
    isEquipe,
    isEdicao,
    isCliente,
    canSeeMoney,
    canApontarHoras,
    roles,
    permissions,
    isLoading: !userRoles,
  };
}

/** Hook to fetch all user permissions (admin only, for management page) */
export function useAllUserPermissions() {
  return useQuery({
    queryKey: ["all_user_permissions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_permissions")
        .select("*");
      if (error) throw error;
      return data as { id: string; user_id: string; module: string; permission: PermissionLevel }[];
    },
  });
}
