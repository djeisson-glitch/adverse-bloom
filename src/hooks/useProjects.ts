import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

/**
 * O dinheiro do projeto (valor vendido, margem, custo/hora padrão) não mora
 * mais em `projects` — ficava legível por qualquer pessoa logada pela API.
 * Mora em projects_financeiro, que só a gestão lê. A view projects_v recompõe
 * os dois; pra quem não pode ver dinheiro, esses campos vêm null.
 */
export type Project = Tables<"projects"> & {
  sold_value: number | null;
  direct_costs: number | null;
  contract_value: number | null;
  invoiced_value: number | null;
  custo_hora_padrao: number | null;
  gross_margin_value: number | null;
  gross_margin_percent: number | null;
};

/**
 * As etapas do projeto — e só elas viram coluna no board.
 *
 * "Entregue" e "Faturado" saíram daqui: eram etapa e marca de arquivo ao mesmo
 * tempo, então projeto acabado ocupava coluna. Agora acabar é uma AÇÃO
 * (Finalizar projeto), não uma etapa — quem finaliza sai do board e vai pra
 * aba Finalizados.
 */
export const PRODUCTION_STAGES_NEW = [
  { id: "novo", label: "Novo projeto", color: "border-slate-500/40" },
  { id: "pre-producao", label: "Pré-produção", color: "border-amber-500/40" },
  { id: "producao", label: "Produção", color: "border-blue-500/40" },
  { id: "pos-producao", label: "Pós-produção", color: "border-purple-500/40" },
  { id: "fechamento", label: "Fechamento", color: "border-emerald-500/40" },
] as const;

/**
 * Projeto fora do board. `finalizado` é o novo (botão Finalizar); `entregue` e
 * `faturado` são o legado — 174 projetos importados estão assim e continuam
 * valendo como finalizados.
 */
export const STATUS_FINALIZADO = ["finalizado", "entregue", "faturado"];
export const isFinalizado = (status?: string | null) => STATUS_FINALIZADO.includes(status || "");

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects_v")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (project: any) => {
      // o dinheiro não entra no insert: vai pela RPC, que checa o papel
      const { sold_value, direct_costs, contract_value, invoiced_value, custo_hora_padrao, ...campos } = project;
      const { data, error } = await supabase.from("projects").insert(campos as any).select().single();
      if (error) throw error;

      if (sold_value != null || direct_costs != null || contract_value != null) {
        await (supabase as any).rpc("set_projeto_financeiro", {
          _project_id: data.id,
          _sold_value: sold_value ?? null,
          _direct_costs: direct_costs ?? null,
          _contract_value: contract_value ?? sold_value ?? null,
        });
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useCreateProjectFromBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { data, error } = await supabase
        .rpc("create_project_from_budget", { p_budget_id: budgetId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      const { sold_value, direct_costs, contract_value, invoiced_value, custo_hora_padrao, ...campos } = updates as any;
      if (sold_value != null || direct_costs != null || contract_value != null || invoiced_value != null || custo_hora_padrao != null) {
        const { error: e } = await (supabase as any).rpc("set_projeto_financeiro", {
          _project_id: id,
          _sold_value: sold_value ?? null,
          _direct_costs: direct_costs ?? null,
          _contract_value: contract_value ?? null,
          _invoiced_value: invoiced_value ?? null,
          _custo_hora_padrao: custo_hora_padrao ?? null,
        });
        if (e) throw e;
      }
      if (!Object.keys(campos).length) return { id };
      const { data, error } = await supabase.from("projects").update(campos as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
