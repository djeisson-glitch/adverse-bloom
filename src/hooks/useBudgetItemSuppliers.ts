import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BudgetItemSupplier {
  id?: string;
  budget_item_id: string;
  budget_id: string;
  supplier_name: string;
  unit_price: number;
  days: number;
  people: number;
  total: number;
  notes?: string | null;
}

export function useBudgetItemSuppliers(budgetId: string | null) {
  return useQuery({
    queryKey: ["budget_item_suppliers", budgetId],
    enabled: !!budgetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_item_suppliers")
        .select("*")
        .eq("budget_id", budgetId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as BudgetItemSupplier[];
    },
  });
}

export function useSaveBudgetItemSuppliers() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ budgetId, suppliers }: { budgetId: string; suppliers: BudgetItemSupplier[] }) => {
      // Delete existing and re-insert
      await supabase.from("budget_item_suppliers").delete().eq("budget_id", budgetId);

      if (suppliers.length > 0) {
        const toInsert = suppliers.map(({ id, ...rest }) => ({
          ...rest,
          budget_id: budgetId,
        }));
        const { error } = await supabase.from("budget_item_suppliers").insert(toInsert as any[]);
        if (error) throw error;
      }
    },
    onSuccess: (_, { budgetId }) => {
      qc.invalidateQueries({ queryKey: ["budget_item_suppliers", budgetId] });
    },
  });
}
