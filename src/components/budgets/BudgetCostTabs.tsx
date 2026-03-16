import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CostEntryTab } from "./CostEntryTab";
import { CostReportTab } from "./CostReportTab";
import { SupplierManagement } from "./SupplierManagement";
import { formatCurrency } from "@/lib/format";
import type { BudgetWithItems } from "@/hooks/useBudgets";

interface Props {
  budget: BudgetWithItems;
}

export function BudgetCostTabs({ budget }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          #{budget.budget_number} v{budget.version} — {budget.project_name}
        </h2>
        <span className="text-sm text-muted-foreground">{budget.client_name}</span>
      </div>

      <Tabs defaultValue="costs" className="w-full">
        <TabsList>
          <TabsTrigger value="costs">Custos Reais</TabsTrigger>
          <TabsTrigger value="report">Relatório</TabsTrigger>
          <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
        </TabsList>

        <TabsContent value="costs">
          <CostEntryTab budget={budget} items={budget.budget_items} />
        </TabsContent>

        <TabsContent value="report">
          <CostReportTab budget={budget} items={budget.budget_items} />
        </TabsContent>

        <TabsContent value="suppliers">
          <SupplierManagement budget={budget} items={budget.budget_items} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
