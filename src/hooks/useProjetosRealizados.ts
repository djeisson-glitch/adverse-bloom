import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PeriodRange } from "@/components/PeriodFilter";

/**
 * Projetos realizados (cards concluídos da lista Produção & Pós, via ClickUp)
 * no período. Fonte única para o ticket médio — usar em todas as telas pra não
 * divergir (Home vs Resultados).
 */
export function useProjetosRealizados(period: PeriodRange): number {
  const { data } = useQuery({
    queryKey: ["clickup_projetos"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("clickup_cache").select("payload").eq("data_type", "projetos_finalizados").maybeSingle();
      return (data?.payload?.itens ?? []) as Array<{ data: string | null; concluido: boolean }>;
    },
  });
  return useMemo(
    () => (data ?? []).filter((p) => p.concluido && p.data && p.data >= period.from && p.data <= period.to).length,
    [data, period.from, period.to],
  );
}
