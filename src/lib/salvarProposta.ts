import { supabase } from "@/integrations/supabase/client";

/** Preserva campos da outra carta, que compartilha o JSON desta opção. */
export async function salvarPropostaCampos(budgetId: string, patch: Record<string, unknown>) {
  const { data, error: leitura } = await (supabase as any).from("budgets").select("proposta").eq("id", budgetId).single();
  if (leitura) throw leitura;
  const proposta = { ...(data?.proposta || {}), ...patch };
  const { error } = await (supabase as any).from("budgets").update({ proposta }).eq("id", budgetId).select("id").single();
  if (error) throw error;
  return proposta;
}
