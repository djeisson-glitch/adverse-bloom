import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Budget, BudgetItem } from "@/hooks/useBudgets";

interface ProjectCost {
  id: string;
  budget_item_id: string | null;
  category: string | null;
  amount: number;
}

interface Props {
  budget: Budget;
  items: BudgetItem[];
}

export function CostReportTab({ budget, items }: Props) {
  const { data: costs = [] } = useQuery({
    queryKey: ["project_costs", budget.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_costs")
        .select("id, budget_item_id, category, amount")
        .eq("budget_id", budget.id);
      if (error) throw error;
      return data as ProjectCost[];
    },
  });

  const report = useMemo(() => {
    const manualCosts = costs.reduce((s, c) => s + c.amount, 0);
    const marginBase = budget.subtotal_2 ?? 0;
    const totalCliente = budget.total_value ?? 0;
    const impostoValue = budget.tax_value ?? 0;
    const supplierCostsFromItems = items
      .filter((i) => i.has_supplier_cost)
      .reduce((s, i) => s + (i.supplier_cost ?? 0), 0);
    const executedTotal = supplierCostsFromItems + manualCosts;

    const margemOrcada = budget.original_margin_value ?? budget.margin_value ?? 0;
    const margemOrcadaPct = budget.original_margin_percent ?? budget.margin_percent ?? 0;

    // Real margin = Sub-Total 2 - imposto - fornecedores lançados
    const margemReal = marginBase - impostoValue - executedTotal;
    const margemRealPct = marginBase > 0 ? (margemReal / marginBase) * 100 : 0;

    // Per category breakdown
    const categories = [...new Set(items.map(i => i.category))];
    const byCategory = categories.map(cat => {
      const catItems = items.filter(i => i.category === cat);
      const orcado = catItems.reduce((s, i) => s + i.client_price, 0);

      const itemDetails = catItems.map(item => {
        const itemCosts = costs.filter(c => c.budget_item_id === item.id);
        const manualItemCosts = itemCosts.reduce((s, c) => s + c.amount, 0);
        const supplierItemCost = item.has_supplier_cost ? item.supplier_cost ?? 0 : 0;
        const itemExecutado = supplierItemCost + manualItemCosts;
        return {
          name: item.item_name,
          orcado: item.client_price,
          executado: itemExecutado,
          delta: item.client_price - itemExecutado,
        };
      });

      const catExecutado = itemDetails.reduce((s, i) => s + i.executado, 0);

      return { category: cat, orcado, executado: catExecutado, delta: orcado - catExecutado, items: itemDetails };
    });

    return {
      totalCliente,
      marginBase,
      impostoValue,
      executedTotal,
      margemOrcada,
      margemOrcadaPct,
      margemReal,
      margemRealPct,
      variacao: margemReal - margemOrcada,
      byCategory,
    };
  }, [budget, items, costs]);

  const DeltaIcon = ({ value }: { value: number }) => {
    if (value > 0) return <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--success))]" />;
    if (value < 0) return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const deltaColor = (v: number) => v > 0 ? "text-[hsl(var(--success))]" : v < 0 ? "text-destructive" : "text-muted-foreground";
  const deltaPrefix = (v: number) => v > 0 ? "-" : v < 0 ? "+" : "";

  return (
    <div className="space-y-4">
      {/* Financial summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo Financeiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Cliente</span>
              <span className="font-semibold">{formatCurrency(report.totalCliente)}</span>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Custos Deduzidos</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Imposto ({budget.tax_percent ?? 0}%)</span>
                <span>{formatCurrency(report.impostoValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Logística (previsto)</span>
                <span>{formatCurrency(report.logisticaSum)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fornecedores (lançados)</span>
                <span>{formatCurrency(report.executedTotal)}</span>
              </div>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Margem</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Orçada</span>
                <span>{formatCurrency(report.margemOrcada)} ({formatPercent(report.margemOrcadaPct)})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Executada</span>
                <span className={deltaColor(report.variacao)}>
                  {formatCurrency(report.margemReal)} ({formatPercent(report.margemRealPct)}) {report.variacao >= 0 ? "✅" : "⚠️"}
                </span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Variação</span>
                <span className={deltaColor(report.variacao)}>
                  {report.variacao >= 0 ? "+" : ""}{formatCurrency(report.variacao)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalhamento por Categoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {report.byCategory.map(cat => (
            <div key={cat.category} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">{cat.category}</h4>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Orçado: {formatCurrency(cat.orcado)}</span>
                  <span className="text-muted-foreground">Exec: {formatCurrency(cat.executado)}</span>
                  <span className={`font-medium ${deltaColor(cat.delta)}`}>
                    <DeltaIcon value={cat.delta} />
                  </span>
                </div>
              </div>
              <div className="space-y-1 pl-3 border-l-2 border-border">
                {cat.items.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm py-1">
                    <span className="text-muted-foreground">{item.name}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span>Orçado: {formatCurrency(item.orcado)}</span>
                      <span>Exec: {formatCurrency(item.executado)}</span>
                      <span className={`font-medium ${deltaColor(item.delta)}`}>
                        Δ: {item.delta >= 0 ? "-" : "+"}{formatCurrency(Math.abs(item.delta))} {item.delta >= 0 ? "✅" : "⚠️"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
