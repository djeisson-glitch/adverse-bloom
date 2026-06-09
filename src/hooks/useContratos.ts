import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Contrato {
  id: string;
  cliente: string;
  valor_mensal: number;
  ativo: boolean;
  observacao: string | null;
}

export function useContratos() {
  return useQuery({
    queryKey: ["contratos_recorrentes"],
    queryFn: async (): Promise<Contrato[]> => {
      const { data } = await (supabase as any)
        .from("contratos_recorrentes").select("*").order("valor_mensal", { ascending: false });
      return (data as Contrato[]) ?? [];
    },
  });
}

/** MRR = soma dos contratos ativos. */
export function useMRR() {
  const { data } = useContratos();
  const ativos = (data ?? []).filter((c) => c.ativo);
  return { mrr: ativos.reduce((s, c) => s + (c.valor_mensal || 0), 0), contratos: ativos.length };
}
