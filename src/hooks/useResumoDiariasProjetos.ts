import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resumoDiariasPorProjeto, type DiariaResumo } from "@/lib/resumoDiarias";

export function useResumoDiariasProjetos(projectIds: string[], enabled = true) {
  const ids = [...new Set(projectIds)].sort();
  return useQuery({
    // As alterações nas Saídas de produção já invalidam este prefixo.
    queryKey: ["producao_saidas", "resumo-projetos", ids],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const saidas: DiariaResumo[] = [];
      // Sem limite de período: projetos antigos também têm diárias registradas.
      for (let inicio = 0; inicio < ids.length; inicio += 100) {
        for (let pagina = 0; ; pagina += 500) {
          const { data, error } = await (supabase as any)
            .from("producao_saidas")
            .select("id, project_id, tipo, status, fracao")
            .in("project_id", ids.slice(inicio, inicio + 100))
            .eq("tipo", "diaria")
            .order("id")
            .range(pagina, pagina + 499);
          if (error) throw error;
          const linhas = (data || []) as DiariaResumo[];
          saidas.push(...linhas);
          if (linhas.length < 500) break;
        }
      }
      return resumoDiariasPorProjeto(saidas);
    },
  });
}
