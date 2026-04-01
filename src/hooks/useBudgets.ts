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
  is_deliverable: boolean;
  group_name?: string | null;
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
  original_margin_value?: number;
  original_margin_percent?: number;
  real_costs_total?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  budget_number: number | null;
  version: number;
  parent_budget_id: string | null;
  is_latest_version: boolean;
  deal_id: string | null;
  not_included: string[];
  version_notes: string | null;
}

export interface BudgetWithItems extends Budget {
  budget_items: BudgetItem[];
}

type ProjectCostDetail = {
  budget_id: string;
  budget_item_id: string | null;
  amount: number | null;
};

type ItemSummary = {
  id: string;
  budget_id: string;
  category: string;
  client_price: number;
};

/**
 * Builds a map of budget_id → item_id → sum(real costs)
 */
function buildCostsByBudgetItem(costs: ProjectCostDetail[]) {
  const map: Record<string, Record<string, number>> = {};
  for (const c of costs) {
    if (!map[c.budget_id]) map[c.budget_id] = {};
    const itemKey = c.budget_item_id ?? "__unlinked__";
    map[c.budget_id][itemKey] = (map[c.budget_id][itemKey] ?? 0) + (c.amount ?? 0);
  }
  return map;
}

/**
 * Calculates real margin for a budget:
 * - Always deducts tax (tax_value)
 * - Logística items are assumed costs (client_price) unless real costs exist for that item
 * - All other real costs are deducted normally
 */
function applyRealMarginToBudget<T extends Budget>(
  budget: T,
  costsByItem: Record<string, number>,
  items: ItemSummary[]
): T {
  const totalCliente = budget.total_value ?? 0;
  const taxValue = budget.tax_value ?? 0;

  // Calculate effective costs per item
  let totalDeductions = taxValue;

  // Track which items have real costs
  const itemIdsWithCosts = new Set(
    Object.keys(costsByItem).filter((k) => k !== "__unlinked__" && costsByItem[k] > 0)
  );

  // Add Logística assumed costs (client_price) for items WITHOUT real costs
  for (const item of items) {
    if (item.category.toLowerCase() === "logística") {
      const realCost = costsByItem[item.id] ?? 0;
      if (realCost > 0) {
        totalDeductions += realCost;
        itemIdsWithCosts.delete(item.id); // handled
      } else {
        totalDeductions += item.client_price;
      }
    }
  }

  // Add all other real costs (non-Logística items + unlinked)
  const logisticaItemIds = new Set(
    items.filter((i) => i.category.toLowerCase() === "logística").map((i) => i.id)
  );
  for (const [itemId, amount] of Object.entries(costsByItem)) {
    if (!logisticaItemIds.has(itemId) && amount > 0) {
      totalDeductions += amount;
    }
  }

  const realMarginValue = totalCliente - totalDeductions;
  const hasAnyCost = totalDeductions > taxValue; // has costs beyond just tax
  const realMarginPercent = totalCliente > 0
    ? (!hasAnyCost && items.filter(i => i.category.toLowerCase() === "logística").length === 0
        ? 100
        : (realMarginValue / totalCliente) * 100)
    : 0;

  return {
    ...budget,
    original_margin_value: budget.original_margin_value ?? budget.margin_value ?? 0,
    original_margin_percent: budget.original_margin_percent ?? budget.margin_percent ?? 0,
    real_costs_total: totalDeductions,
    margin_value: realMarginValue,
    margin_percent: realMarginPercent,
  };
}

export function useBudgets() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("is_latest_version", true)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const budgets = ((data as any[]) ?? []).map((b) => ({
        ...b,
        not_included: (b.not_included ?? []) as string[],
      })) as Budget[];

      if (budgets.length === 0) return [];

      const { data: costs, error: costsError } = await supabase
        .from("project_costs")
        .select("budget_id, amount")
        .in("budget_id", budgets.map((budget) => budget.id));
      if (costsError) throw costsError;

      const realCostsMap = buildRealCostsMap((costs ?? []) as ProjectCostSummary[]);
      return budgets.map((budget) => applyRealMarginToBudget(budget, realCostsMap[budget.id] ?? 0));
    },
  });
}

export function useBudgetWithItems(id: string | null) {
  return useQuery({
    queryKey: ["budget", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: budget, error }, { data: items, error: itemsError }, { data: costs, error: costsError }] = await Promise.all([
        supabase.from("budgets").select("*").eq("id", id!).single(),
        supabase.from("budget_items").select("*").eq("budget_id", id!).order("order_index", { ascending: true }),
        supabase.from("project_costs").select("budget_id, amount").eq("budget_id", id!),
      ]);
      if (error) throw error;
      if (itemsError) throw itemsError;
      if (costsError) throw costsError;

      const realCostsTotal = ((costs ?? []) as ProjectCostSummary[]).reduce((sum, cost) => sum + (cost.amount ?? 0), 0);

      return applyRealMarginToBudget({
        ...budget,
        not_included: (budget.not_included ?? []) as string[],
        budget_items: (items ?? []) as BudgetItem[],
      } as BudgetWithItems, realCostsTotal);
    },
  });
}

export function useBudgetVersions(budgetNumber: number | null) {
  return useQuery({
    queryKey: ["budget_versions", budgetNumber],
    enabled: !!budgetNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("budget_number", budgetNumber!)
        .order("version", { ascending: true });
      if (error) throw error;

      const versions = (data ?? []) as Budget[];
      if (versions.length === 0) return [];

      const { data: costs, error: costsError } = await supabase
        .from("project_costs")
        .select("budget_id, amount")
        .in("budget_id", versions.map((version) => version.id));
      if (costsError) throw costsError;

      const realCostsMap = buildRealCostsMap((costs ?? []) as ProjectCostSummary[]);
      return versions.map((version) => applyRealMarginToBudget(version, realCostsMap[version.id] ?? 0));
    },
  });
}

async function getNextBudgetNumber(): Promise<number> {
  const { data, error } = await supabase.rpc("next_budget_number");
  if (error) {
    // Fallback: query max manually
    const { data: maxData } = await supabase
      .from("budgets")
      .select("budget_number")
      .order("budget_number", { ascending: false })
      .limit(1);
    return (maxData?.[0]?.budget_number ?? 157) + 1;
  }
  return data as number;
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
      // Prepare budget JSON for the atomic function
      const budgetPayload: Record<string, any> = { ...budget };
      if (!budgetPayload.budget_number && !budgetPayload.id) {
        budgetPayload.budget_number = await getNextBudgetNumber();
      }

      // Prepare items with fallback defaults
      const itemsPayload = items.map((item, idx) => {
        const { id, budget_id, ...rest } = item as any;
        return {
          ...rest,
          order_index: idx,
          quantity: rest.quantity ?? 1,
          client_days: rest.client_days ?? 1,
          client_people: rest.client_people ?? 1,
          client_unit_price: rest.client_unit_price ?? 0,
          client_price: rest.client_price ?? 0,
          supplier_cost: rest.supplier_cost ?? 0,
          supplier_days: rest.supplier_days ?? 0,
          supplier_people: rest.supplier_people ?? 0,
          supplier_unit_price: rest.supplier_unit_price ?? 0,
        };
      });

      // Call atomic DB function — delete + insert happen in one transaction
      const { data, error } = await supabase.rpc("save_budget_atomic", {
        p_budget: budgetPayload as any,
        p_items: itemsPayload as any,
      });
      if (error) throw error;

      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      queryClient.invalidateQueries({ queryKey: ["budget_versions"] });
      toast({ title: "Orçamento salvo com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar orçamento", description: err.message, variant: "destructive" });
    },
  });
}

export function useCreateNewVersion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      // Fetch source budget
      const { data: source, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (error) throw error;

      const { data: items, error: itemsErr } = await supabase
        .from("budget_items")
        .select("*")
        .eq("budget_id", sourceId);
      if (itemsErr) throw itemsErr;

      // Get max version for this budget_number
      const { data: versions } = await supabase
        .from("budgets")
        .select("version")
        .eq("budget_number", source.budget_number)
        .order("version", { ascending: false })
        .limit(1);
      const nextVersion = (versions?.[0]?.version ?? 0) + 1;

      // Mark all previous versions as not latest
      await supabase
        .from("budgets")
        .update({ is_latest_version: false })
        .eq("budget_number", source.budget_number);

      // Insert new version
      const { id: _id, created_at, updated_at, ...rest } = source;
      const { data: newBudget, error: insertErr } = await supabase
        .from("budgets")
        .insert({
          ...rest,
          version: nextVersion,
          parent_budget_id: sourceId,
          is_latest_version: true,
          status: "draft",
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      // Duplicate items
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
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      queryClient.invalidateQueries({ queryKey: ["budget_versions"] });
      toast({ title: "Nova versão criada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar versão", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // Check if this budget has child versions
      const { data: children } = await supabase
        .from("budgets")
        .select("id")
        .eq("parent_budget_id", id);

      if (children && children.length > 0) {
        throw new Error("Não é possível excluir: existem versões baseadas neste orçamento.");
      }

      // Get budget info before deleting
      const { data: budget } = await supabase
        .from("budgets")
        .select("budget_number, version, is_latest_version, parent_budget_id")
        .eq("id", id)
        .single();

      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;

      // If deleted was latest, mark previous version as latest
      if (budget?.is_latest_version && budget.parent_budget_id) {
        await supabase
          .from("budgets")
          .update({ is_latest_version: true })
          .eq("id", budget.parent_budget_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget_versions"] });
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

      // New budget number for the copy
      const budgetNumber = await getNextBudgetNumber();
      const { id: _id, created_at, updated_at, ...rest } = original;
      const { data: newBudget, error: insertErr } = await supabase
        .from("budgets")
        .insert({
          ...rest,
          project_name: `${rest.project_name} (cópia)`,
          status: "draft",
          budget_number: budgetNumber,
          version: 1,
          parent_budget_id: null,
          is_latest_version: true,
        })
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
