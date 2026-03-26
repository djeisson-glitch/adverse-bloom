import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ModuleId = "crm" | "orcamentos" | "financeiro" | "propostas" | "producao";
export type PermissionLevel = "none" | "view" | "edit";

export const MODULES: { id: ModuleId; label: string; description: string }[] = [
  { id: "crm", label: "CRM / Comercial", description: "Pipeline de vendas, deals, clientes" },
  { id: "orcamentos", label: "Orçamentos", description: "Criar e gerenciar orçamentos" },
  { id: "financeiro", label: "Financeiro", description: "Fluxo de caixa, custos, contas a pagar, projeções" },
  { id: "propostas", label: "Propostas", description: "Gerar e enviar propostas aos clientes" },
  { id: "producao", label: "Produção", description: "Pipeline de produção dos projetos" },
];

interface UserPermission {
  module: string;
  permission: PermissionLevel;
}

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
      return data.map((r) => r.role);
    },
  });

  const isAdmin = userRoles?.includes("admin") ?? false;

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

  const can = (module: ModuleId, level: PermissionLevel = "view"): boolean => {
    if (isAdmin) return true;
    if (!permissions) return false;

    const perm = permissions.find((p) => p.module === module);
    if (!perm) return false;

    if (level === "view") return perm.permission === "view" || perm.permission === "edit";
    if (level === "edit") return perm.permission === "edit";
    return true;
  };

  return { can, isAdmin, permissions, isLoading: !userRoles };
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
