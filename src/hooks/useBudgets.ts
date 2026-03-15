import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BudgetItem {
  id?: string;
  budget_id?: string;
  category: string;
  item_name: string;
  client_days: number;
  client_people: number;
  client_unit_price: number;
  client_price: number;
  has_supplier_cost: boolean;
  supplier_days: number;
  supplier_people: number;
  supplier_unit_price: number;
  supplier_cost: number;
  margin_value: number;
  margin_percent: number;
  order_index: number;
}

export interface Budget {
  id: string;
  project_name: string;
  client_name: string;
  status: string;
  markup_percent: number;
  tax_percent: number;
  bv_percent: number;
  commission_percent: number;
  discount: number;
  addition: number;
  subtotal_1: number;
  subtotal_2: number;
  tax_value: number;
  bv_value: number;
  commission_value: number;
  total_value: number;
  margin_value: number;
  margin_percent: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetWithItems extends Budget {
  budget_items: BudgetItem[];
}

export function useBudgets() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Budget[];
    },
  });
}

export function useBudgetWithItems(id: string | null) {
  return useQuery({
    queryKey: ["budget", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: budget, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;

      const { data: items, error: itemsError } = await supabase
        .from("budget_items")
        .select("*")
        .eq("budget_id", id!)
        .order("order_index", { ascending: true });
      if (itemsError) throw itemsError;

      return { ...budget, budget_items: items } as BudgetWithItems;
    },
  });
}

export function useSaveBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      budget,
      items,
    }: {
      budget: Omit<Budget, "id" | "created_at" | "updated_at"> & { id?: string };
      items: BudgetItem[];
    }) => {
      let budgetId = budget.id;

      if (budgetId) {
        const { error } = await supabase
          .from("budgets")
          .update({ ...budget, updated_at: new Date().toISOString() })
          .eq("id", budgetId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("budgets")
          .insert(budget)
          .select("id")
          .single();
        if (error) throw error;
        budgetId = data.id;
      }

      // Delete existing items and re-insert
      await supabase.from("budget_items").delete().eq("budget_id", budgetId);

      if (items.length > 0) {
        const itemsToInsert = items.map((item, idx) => ({
          ...item,
          budget_id: budgetId,
          order_index: idx,
          id: undefined,
        }));
        const { error } = await supabase.from("budget_items").insert(itemsToInsert);
        if (error) throw error;
      }

      return budgetId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      toast({ title: "Orçamento salvo com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar orçamento", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: "Orçamento excluído." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    },
  });
}

export function useDuplicateBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch original
      const { data: original, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      const { data: items, error: itemsErr } = await supabase
        .from("budget_items")
        .select("*")
        .eq("budget_id", id);
      if (itemsErr) throw itemsErr;

      // Insert copy
      const { id: _id, created_at, updated_at, ...rest } = original;
      const { data: newBudget, error: insertErr } = await supabase
        .from("budgets")
        .insert({ ...rest, project_name: `${rest.project_name} (cópia)`, status: "draft" })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      if (items && items.length > 0) {
        const newItems = items.map(({ id: _iid, budget_id, created_at: _ca, ...itemRest }) => ({
          ...itemRest,
          budget_id: newBudget.id,
        }));
        await supabase.from("budget_items").insert(newItems);
      }

      return newBudget.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: "Orçamento duplicado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao duplicar", description: err.message, variant: "destructive" });
    },
  });
}

export function useBudgetSettings() {
  return useQuery({
    queryKey: ["budget_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
