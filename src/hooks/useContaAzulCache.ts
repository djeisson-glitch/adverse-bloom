import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useContaAzulCache(dataType: string) {
  return useQuery({
    queryKey: ["conta-azul-cache", dataType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conta_azul_cache")
        .select("*")
        .eq("data_type", dataType)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAllContaAzulCache() {
  const accounts = useContaAzulCache("accounts");
  const receivables = useContaAzulCache("receivables");
  const payables = useContaAzulCache("payables");
  const categories = useContaAzulCache("categories");
  return { accounts, receivables, payables, categories };
}

/** Extract items array from payload (handles array, {itens: []}, or {items: []} shape) */
export function extractItems<T = any>(payload: unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as T[];
  if (typeof payload === "object" && payload !== null) {
    const p = payload as any;
    if (Array.isArray(p.itens)) return p.itens as T[];
    if (Array.isArray(p.items)) return p.items as T[];
  }
  return [];
}

export function useSyncContaAzul() {
  return async () => {
    const { data, error } = await supabase.functions.invoke("conta-azul-sync");
    if (error) throw error;
    return data;
  };
}

export function useSyncSheets() {
  return async () => {
    const { data, error } = await supabase.functions.invoke("sheets-sync");
    if (error) throw error;
    return data;
  };
}
