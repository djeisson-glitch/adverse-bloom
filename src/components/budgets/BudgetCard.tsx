import { Copy, Edit, Trash2, FileDown, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { generateBudgetPDF } from "@/lib/generateBudgetPDF";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Budget, BudgetItem } from "@/hooks/useBudgets";

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  rejected: "destructive",
};

interface Props {
  budget: Budget;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShowVersions?: () => void;
  versionCount?: number;
}

export function BudgetCard({ budget, onEdit, onDuplicate, onDelete, onShowVersions, versionCount }: Props) {
  const { toast } = useToast();

  const handlePDF = async () => {
    try {
      const { data: items, error } = await supabase
        .from("budget_items")
        .select("*")
        .eq("budget_id", budget.id)
        .order("order_index", { ascending: true });
      if (error) throw error;
      generateBudgetPDF(budget, (items || []) as BudgetItem[]);
    } catch {
      toast({ title: "Erro ao gerar PDF", variant: "destructive" });
    }
  };

  const budgetLabel = budget.budget_number
    ? `#${budget.budget_number} v${budget.version}`
    : "";

  return (
    <Card className="group relative transition-colors hover:border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {budgetLabel && <span className="text-muted-foreground mr-2">{budgetLabel}</span>}
              {budget.project_name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{budget.client_name}</p>
          </div>
          <Badge variant={statusVariants[budget.status]}>{statusLabels[budget.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold text-foreground">{formatCurrency(budget.total_value)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Margem</span>
          <span
            className={
              budget.margin_percent >= 20
                ? "text-[hsl(var(--success))]"
                : budget.margin_percent >= 10
                ? "text-[hsl(var(--warning))]"
                : "text-destructive"
            }
          >
            {formatPercent(budget.margin_percent)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{formatDate(budget.created_at)}</p>

        <div className="flex gap-1 pt-1 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar
          </Button>
          <Button variant="ghost" size="sm" onClick={handlePDF}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          {versionCount && versionCount > 1 && onShowVersions && (
            <Button variant="ghost" size="sm" onClick={onShowVersions}>
              <History className="h-3.5 w-3.5 mr-1" /> {versionCount} versões
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
