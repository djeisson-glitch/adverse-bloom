import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Deal = Tables<"deals"> & {
  client?: Tables<"clients"> | null;
  creator?: Tables<"profiles"> | null;
  approved_value?: number | null;
};

/**
 * Stages Catalunya OS — funil comercial do Adverse OS Produtora.
 * Ordem: lead → elaboracao → proposta → negociacao → aceite → fechado_ganho.
 * 'perdido' é ramo lateral. A probability é usada na Previsão ponderada.
 * Aceite = cliente aceitou (ganho). Fechado – Ganho = negócio fechado/encerrado.
 */
export const STAGES = [
  { id: "lead",          label: "Lead / Pedido Recebido", color: "#22c55e", probability: 10,  emoji: "🟢" },
  { id: "elaboracao",    label: "Em Elaboração",          color: "#f59e0b", probability: 40,  emoji: "✍️" },
  { id: "proposta",      label: "Proposta Enviada",       color: "#3b82f6", probability: 60,  emoji: "📤" },
  { id: "negociacao",    label: "Negociação",             color: "#a855f7", probability: 80,  emoji: "🤝" },
  { id: "aceite",        label: "Aceite",                 color: "#10b981", probability: 100, emoji: "☑️" },
  { id: "fechado_ganho", label: "Fechado – Ganho",        color: "#16a34a", probability: 100, emoji: "🏆" },
  { id: "perdido",       label: "Perdido",                color: "#ef4444", probability: 0,   emoji: "❌" },
] as const;

export type Stage = (typeof STAGES)[number]["id"];

/** Estágios "ganhos" (fora do funil aberto): aceite e fechado – ganho. */
export function isWonStage(stage: string | null | undefined): boolean {
  return stage === "aceite" || stage === "fechado_ganho";
}

export function useDeals() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*, client:clients(*), creator:profiles!deals_created_by_fkey(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch latest budget values for all deals
      const dealIds = (data || []).map((d: any) => d.id);
      let budgetMap: Record<string, number> = {};
      if (dealIds.length > 0) {
        const { data: budgets } = await supabase
          .from("budgets")
          .select("deal_id, total_value, status")
          .in("deal_id", dealIds)
          .eq("is_latest_version", true);
        (budgets || []).forEach((b: any) => {
          if (b.deal_id) budgetMap[b.deal_id] = (budgetMap[b.deal_id] || 0) + (b.total_value || 0);
        });
      }

      return (data || []).map((d: any) => ({
        ...d,
        approved_value: budgetMap[d.id] ?? null,
      })) as Deal[];
    },
  });

  const createDeal = useMutation({
    mutationFn: async (deal: TablesInsert<"deals">) => {
      const { data, error } = await supabase.from("deals").insert(deal).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"deals"> & { id: string }) => {
      const { data, error } = await supabase
        .from("deals")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const deleteDeal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  return { ...query, deals: query.data || [], createDeal, updateDeal, deleteDeal };
}

export function useClients() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("type", "cliente").order("name");
      if (error) throw error;
      return data;
    },
  });

  const createClient = useMutation({
    mutationFn: async (client: TablesInsert<"clients">) => {
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"clients"> & { id: string }) => {
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  return { ...query, clients: query.data || [], createClient, updateClient };
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
  });
}
