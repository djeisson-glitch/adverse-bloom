import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Project = Tables<"projects">;

export const PRODUCTION_STAGES_NEW = [
  { id: "briefing", label: "Briefing", color: "border-slate-500/40" },
  { id: "pre-producao", label: "Pré-produção", color: "border-amber-500/40" },
  { id: "producao", label: "Em Produção", color: "border-blue-500/40" },
  { id: "revisao", label: "Revisão Cliente", color: "border-purple-500/40" },
  { id: "entregue", label: "Entregue", color: "border-cyan-500/40" },
  { id: "faturado", label: "Faturado", color: "border-emerald-500/40" },
] as const;

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
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
    mutationFn: async (project: Omit<TablesInsert<"projects">, "id" | "created_at" | "gross_margin_value" | "gross_margin_percent">) => {
      const { data, error } = await supabase.from("projects").insert(project as any).select().single();
      if (error) throw error;
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
      const { data, error } = await supabase.from("projects").update(updates as any).eq("id", id).select().single();
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
