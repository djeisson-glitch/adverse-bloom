import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type PresetItem = Tables<"budget_preset_items">;

export function usePresetItems() {
  return useQuery({
    queryKey: ["budget_preset_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_preset_items")
        .select("*")
        .order("category")
        .order("item_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSavePresetItem() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (item: TablesInsert<"budget_preset_items">) => {
      const { error } = await supabase.from("budget_preset_items").insert(item);
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
      const { error } = await supabase.from("budget_preset_items").delete().eq("id", id);
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
