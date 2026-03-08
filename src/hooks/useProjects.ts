import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Project = Tables<"projects">;

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
      const soldValue = project.sold_value ?? 0;
      const directCosts = project.direct_costs ?? 0;
      const grossMarginValue = soldValue - directCosts;
      const grossMarginPercent = soldValue > 0 ? (grossMarginValue / soldValue) * 100 : 0;

      const { data, error } = await supabase.from("projects").insert({
        ...project,
        gross_margin_value: grossMarginValue,
        gross_margin_percent: Math.round(grossMarginPercent * 100) / 100,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      const soldValue = updates.sold_value;
      const directCosts = updates.direct_costs;
      if (soldValue !== undefined || directCosts !== undefined) {
        const sv = soldValue ?? 0;
        const dc = directCosts ?? 0;
        updates.gross_margin_value = sv - dc;
        updates.gross_margin_percent = sv > 0 ? Math.round(((sv - dc) / sv) * 100 * 100) / 100 : 0;
      }
      const { data, error } = await supabase.from("projects").update(updates).eq("id", id).select().single();
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
