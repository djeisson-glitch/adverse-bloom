import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { FileText, Edit } from "lucide-react";
import type { BudgetWithItems } from "@/hooks/useBudgets";

interface Props {
  budget: BudgetWithItems;
  onEdit: () => void;
}

export function BudgetViewTab({ budget, onEdit }: Props) {
  const categories = useMemo(() => {
    const cats = [...new Set(budget.budget_items.map(i => i.category))];
    return cats.map(cat => ({
      name: cat,
      items: budget.budget_items.filter(i => i.category === cat),
    }));
  }, [budget.budget_items]);

  const supplierTotal = budget.budget_items
    .filter(i => i.has_supplier_cost)
    .reduce((s, i) => s + i.supplier_cost, 0);

  return (
    <div className="space-y-4">
      {/* Project summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo do Projeto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Cliente:</span>{" "}
              <span className="font-medium text-foreground">{budget.client_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Projeto:</span>{" "}
              <span className="font-medium text-foreground">{budget.project_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              <Badge variant="default" className="ml-1 text-[10px]">✅ Aprovado</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Data:</span>{" "}
              <span className="font-medium text-foreground">{formatDate(budget.created_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 rounded-lg bg-primary/10 p-4 mt-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(budget.total_value ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Margem</p>
              <p className="text-2xl font-bold text-[hsl(var(--success))]">
                {formatPercent(budget.margin_percent ?? 0)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({formatCurrency(budget.margin_value ?? 0)})
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items by category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entregas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {categories.map(cat => (
            <div key={cat.name} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat.name}</h4>
              <div className="space-y-2">
                {cat.items.map(item => {
                  const sobra = item.client_price - (item.has_supplier_cost ? item.supplier_cost : 0);
                  const sobraPct = item.client_price > 0 ? (sobra / item.client_price) * 100 : 100;
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-foreground">{item.item_name}</p>
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(item.client_price)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.client_days} {item.client_days === 1 ? "diária" : "diárias"} × {item.client_people} {item.client_people === 1 ? "pessoa" : "pessoas"} × {formatCurrency(item.client_unit_price)}
                      </p>
                      {item.has_supplier_cost ? (
                        <p className="text-xs text-muted-foreground">
                          Custo fornecedor: {item.supplier_days} dias × {item.supplier_people} pessoa(s) × {formatCurrency(item.supplier_unit_price)} = {formatCurrency(item.supplier_cost)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sem custo de fornecedor</p>
                      )}
                      <p className={`text-xs font-medium ${sobraPct >= 50 ? "text-[hsl(var(--success))]" : sobraPct >= 20 ? "text-[hsl(var(--warning))]" : "text-destructive"}`}>
                        Sobra: {formatCurrency(sobra)} ({sobraPct.toFixed(0)}%)
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Total composition */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Composição do Total</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub-Total 1</span>
              <span className="font-medium">{formatCurrency(budget.subtotal_1 ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Markup ({budget.markup_percent}%)</span>
              <span className="font-medium">{formatCurrency((budget.subtotal_2 ?? 0) - (budget.subtotal_1 ?? 0))}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between">
              <span className="text-muted-foreground">Sub-Total 2</span>
              <span className="font-medium">{formatCurrency(budget.subtotal_2 ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Imposto ({budget.tax_percent}%)</span>
              <span className="font-medium">{formatCurrency(budget.tax_value ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ BV ({budget.bv_percent}%)</span>
              <span className="font-medium">{formatCurrency(budget.bv_value ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Comissão ({budget.commission_percent}%)</span>
              <span className="font-medium">{formatCurrency(budget.commission_value ?? 0)}</span>
            </div>
            {budget.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">- Desconto</span>
                <span className="font-medium text-destructive">-{formatCurrency(budget.discount)}</span>
              </div>
            )}
            {budget.addition > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Acréscimo</span>
                <span className="font-medium">{formatCurrency(budget.addition)}</span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between text-base font-bold">
              <span>TOTAL</span>
              <span className="text-primary">{formatCurrency(budget.total_value ?? 0)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onEdit}>
          <Edit className="mr-2 h-4 w-4" /> Editar Orçamento
        </Button>
      </div>
    </div>
  );
}
