import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PresetItem {
  id: string;
  category: string;
  item_name: string;
  client_days: number;
  client_people: number;
  client_unit_price: number;
  has_supplier_cost: boolean;
  supplier_days: number;
  supplier_people: number;
  supplier_unit_price: number;
  created_at: string;
}

export function usePresetItems() {
  return useQuery({
    queryKey: ["budget_preset_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_preset_items" as any)
        .select("*")
        .order("category")
        .order("item_name");
      if (error) throw error;
      return data as unknown as PresetItem[];
    },
  });
}

export function useSavePresetItem() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (item: Omit<PresetItem, "id" | "created_at">) => {
      const { error } = await supabase.from("budget_preset_items" as any).insert(item as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget_preset_items"] });
      toast({ title: "Item salvo!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar item", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeletePresetItem() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budget_preset_items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget_preset_items"] });
      toast({ title: "Item removido." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });
}
