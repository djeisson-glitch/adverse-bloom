import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmpresaContexto {
  meta_margem_liquida: number | null;
  meta_faturamento_mensal: number | null;
  saldo_inicial: number | null;
  saldo_inicial_data: string | null;
  headcount: number | null;
  estrutura: string | null;
  sazonalidade: string | null;
  prioridades: string | null;
  observacoes: string | null;
}

/**
 * Fonte única do contexto da empresa (metas + âncora de saldo).
 * Usar em TODA página que calcula saldo, pra não divergir entre telas.
 */
export function useEmpresaContexto() {
  return useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async (): Promise<EmpresaContexto | null> => {
      const { data } = await (supabase as any).from("empresa_contexto").select("*").eq("id", 1).maybeSingle();
      return (data as EmpresaContexto) ?? null;
    },
  });
}
