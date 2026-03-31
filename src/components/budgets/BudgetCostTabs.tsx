import { Component, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BudgetViewTab } from "./BudgetViewTab";
import { CostEntryTab } from "./CostEntryTab";
import { CostReportTab } from "./CostReportTab";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { BudgetWithItems } from "@/hooks/useBudgets";

// Error boundary to prevent black screen
class CostTabErrorBoundary extends Component<
  { children: ReactNode; fallbackLabel: string },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode; fallbackLabel: string }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">Erro ao carregar {this.props.fallbackLabel}</p>
            <p className="text-xs text-muted-foreground max-w-md text-center">{this.state.error}</p>
            <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false, error: "" })}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

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
          <CostTabErrorBoundary fallbackLabel="Orçamento">
            <BudgetViewTab budget={budget} onEdit={onEdit} onRevertToDraft={onClose} />
          </CostTabErrorBoundary>
        </TabsContent>

        <TabsContent value="costs">
          <CostTabErrorBoundary fallbackLabel="Custos Reais">
            <CostEntryTab budget={budget} items={budget.budget_items} />
          </CostTabErrorBoundary>
        </TabsContent>

        <TabsContent value="report">
          <CostTabErrorBoundary fallbackLabel="Relatório">
            <CostReportTab budget={budget} items={budget.budget_items} />
          </CostTabErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
