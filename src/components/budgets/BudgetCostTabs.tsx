import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BudgetViewTab } from "./BudgetViewTab";
import { CostEntryTab } from "./CostEntryTab";
import { CostReportTab } from "./CostReportTab";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BudgetWithItems } from "@/hooks/useBudgets";

interface Props {
  budget: BudgetWithItems;
  onClose: () => void;
  onEdit: () => void;
}

export function BudgetCostTabs({ budget, onClose, onEdit }: Props) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            #{budget.budget_number} v{budget.version} — {budget.project_name}
          </h2>
          <Badge variant="default" className="text-[10px]">Aprovado</Badge>
        </div>
        <span className="text-sm text-muted-foreground">{budget.client_name}</span>
      </div>

      <Tabs defaultValue="view" className="w-full">
        <TabsList>
          <TabsTrigger value="view">Orçamento</TabsTrigger>
          <TabsTrigger value="costs">Custos Reais</TabsTrigger>
          <TabsTrigger value="report">Relatório</TabsTrigger>
        </TabsList>

        <TabsContent value="view">
          <BudgetViewTab budget={budget} onEdit={onEdit} onRevertToDraft={onClose} />
        </TabsContent>

        <TabsContent value="costs">
          <CostEntryTab budget={budget} items={budget.budget_items} />
        </TabsContent>

        <TabsContent value="report">
          <CostReportTab budget={budget} items={budget.budget_items} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
