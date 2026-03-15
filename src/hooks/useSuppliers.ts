import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Supplier {
  id: string;
  budget_id: string;
  budget_item_id: string | null;
  supplier_name: string;
  supplier_doc: string | null;
  amount: number;
  payment_date: string | null;
  status: string;
  sent_to_conta_azul: boolean;
  conta_azul_id: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  budget_project_name?: string;
}

export function useSuppliersByBudget(budgetId: string | null) {
  return useQuery({
    queryKey: ["suppliers", budgetId],
    enabled: !!budgetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("budget_id", budgetId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useAllSuppliers() {
  return useQuery({
    queryKey: ["suppliers_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*, budgets(project_name)")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return (data as any[]).map((s) => ({
        ...s,
        budget_project_name: s.budgets?.project_name ?? "—",
      })) as Supplier[];
    },
  });
}

export function useSaveSupplier() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (supplier: Partial<Supplier> & { budget_id: string; supplier_name: string; amount: number }) => {
      if (supplier.id) {
        const { error } = await supabase
          .from("suppliers")
          .update({ ...supplier, updated_at: new Date().toISOString() })
          .eq("id", supplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(supplier);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers_all"] });
      toast({ title: "Fornecedor salvo!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar fornecedor", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateSupplierStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers_all"] });
      toast({ title: "Status atualizado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });
}

export function useMarkSentToContaAzul() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ sent_to_conta_azul: true, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers_all"] });
    },
  });
}
