import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DELIVERY_TYPES = [
  "Reels Simples",
  "Reels Complexo",
  "Institucional",
  "Evento",
  "Campanha/Manifesto",
  "Podcast",
  "Motion",
  "Redução",
  "Produção",
] as const;

export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export interface DealProject {
  id: string;
  deal_id: string;
  name: string;
  delivery_type: string;
  value: number;
  internal_cost: number;
  margin_value: number;
  margin_percent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useDealProjects(dealId?: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["deal_projects", dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from("deal_projects")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as DealProject[];
    },
    enabled: !!dealId,
  });

  const createProject = useMutation({
    mutationFn: async (project: Partial<DealProject> & { deal_id: string; name: string }) => {
      const { data, error } = await supabase
        .from("deal_projects")
        .insert(project as any)
        .select()
        .single();
      if (error) throw error;
      return data as DealProject;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal_projects"] });
    },
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DealProject> & { id: string }) => {
      const { data, error } = await supabase
        .from("deal_projects")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as DealProject;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal_projects"] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deal_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal_projects"] });
    },
  });

  return {
    ...query,
    projects: query.data || [],
    createProject,
    updateProject,
    deleteProject,
  };
}

export function useAllDealProjects() {
  return useQuery({
    queryKey: ["deal_projects_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DealProject[];
    },
  });
}

export function useDealProjectsByClient(clientId?: string | null) {
  return useQuery({
    queryKey: ["deal_projects_client", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      // Get deals for this client, then get their projects
      const { data: deals, error: dealsErr } = await supabase
        .from("deals")
        .select("id")
        .eq("client_id", clientId);
      if (dealsErr) throw dealsErr;
      if (!deals?.length) return [];
      
      const dealIds = deals.map((d) => d.id);
      const { data, error } = await supabase
        .from("deal_projects")
        .select("*")
        .in("deal_id", dealIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DealProject[];
    },
    enabled: !!clientId,
  });
}
