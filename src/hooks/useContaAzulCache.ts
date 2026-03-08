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

export function useSyncContaAzul() {
  return async () => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conta-azul-sync`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) throw new Error("Erro ao sincronizar");
    return res.json();
  };
}
