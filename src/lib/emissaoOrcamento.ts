import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Chamado somente depois que o PDF foi gerado e o download disparado. */
export async function registrarEmissaoPdf(budgetId: string) {
  const { error } = await (supabase as any).rpc("registrar_emissao_pdf", { _budget_id: budgetId });
  if (error) toast.error("PDF gerado, mas a data de emissão não foi registrada", { description: error.message });
  return !error;
}
