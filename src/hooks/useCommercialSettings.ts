import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineStage {
  id: string;
  label: string;
  color: string;
}

export interface CommercialSettings {
  id: string;
  monthly_target: number;
  followup_won_days: number;
  followup_lost_days: number;
  loss_reasons: string[];
  pipeline_stages: PipelineStage[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: Omit<CommercialSettings, "id" | "created_at" | "updated_at"> = {
  monthly_target: 200000,
  followup_won_days: 180,
  followup_lost_days: 60,
  loss_reasons: ["Preço alto", "Sem budget agora", "Escolheu concorrente", "Projeto cancelado", "Sem resposta", "Outro"],
  pipeline_stages: [
    { id: "contato", label: "Contato Inicial", color: "#3b82f6" },
    { id: "proposta", label: "Proposta", color: "#f59e0b" },
    { id: "negociacao", label: "Negociação", color: "#8b5cf6" },
    { id: "ganho", label: "Ganho", color: "#22c55e" },
    { id: "perdido", label: "Perdido", color: "#ef4444" },
  ],
};

export function useCommercialSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["commercial-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return {
        ...data,
        loss_reasons: (data.loss_reasons as any) || DEFAULT_SETTINGS.loss_reasons,
        pipeline_stages: (data.pipeline_stages as any) || DEFAULT_SETTINGS.pipeline_stages,
      } as CommercialSettings;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<CommercialSettings>) => {
      const settings = query.data;
      if (!settings) throw new Error("Settings not loaded");
      const { data, error } = await supabase
        .from("commercial_settings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", settings.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-settings"] }),
  });

  return {
    settings: query.data || (DEFAULT_SETTINGS as any as CommercialSettings),
    isLoading: query.isLoading,
    updateSettings,
  };
}
