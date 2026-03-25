import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { Edit, FileText } from "lucide-react";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import type { BudgetWithItems } from "@/hooks/useBudgets";
import { GenerateProposalModal } from "./GenerateProposalModal";

interface Props {
  budget: BudgetWithItems;
  onEdit: () => void;
}

function sobraColor(pct: number) {
  if (pct >= 50) return "text-[hsl(var(--success))]";
  if (pct >= 20) return "text-[hsl(var(--warning))]";
  return "text-destructive";
}

function sobraIcon(pct: number) {
  if (pct >= 50) return "✅";
  if (pct >= 20) return "⚠️";
  return "❌";
}

export function BudgetViewTab({ budget, onEdit }: Props) {
  const [proposalOpen, setProposalOpen] = useState(false);
  const categories = useMemo(() => {
    const cats = [...new Set(budget.budget_items.map(i => i.category))];
    return cats.map(cat => ({
      name: cat,
      items: budget.budget_items.filter(i => i.category === cat),
    }));
  }, [budget.budget_items]);

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
              <span className="font-medium text-[hsl(var(--success))]">✅ Aprovado</span>
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

      {/* Items by category — compact table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entregas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {categories.map(cat => {
            return (
              <div key={cat.name} className="space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat.name}</h4>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs h-8 px-3">Item</TableHead>
                        <TableHead className="text-xs h-8 px-3 text-center">Qtd</TableHead>
                        <TableHead className="text-xs h-8 px-3 text-right">Cliente</TableHead>
                        <TableHead className="text-xs h-8 px-3 text-right">Forn.</TableHead>
                        <TableHead className="text-xs h-8 px-3 text-right">Sobra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cat.items.map(item => {
                        const sobra = item.client_price - (item.has_supplier_cost ? item.supplier_cost : 0);
                        const sobraPct = item.client_price > 0 ? (sobra / item.client_price) * 100 : 100;
                        const unitLabel = "d";
                        return (
                          <TableRow key={item.id} className="border-border/50">
                            <TableCell className="py-2 px-3 text-sm font-medium">{item.item_name}</TableCell>
                            <TableCell className="py-2 px-3 text-xs text-muted-foreground text-center whitespace-nowrap">
                              {item.client_days}{unitLabel} × {item.client_people}p
                            </TableCell>
                            <TableCell className="py-2 px-3 text-sm text-right font-medium whitespace-nowrap">
                              {formatCurrency(item.client_price)}
                            </TableCell>
                            <TableCell className="py-2 px-3 text-sm text-right whitespace-nowrap text-muted-foreground">
                              {item.has_supplier_cost ? formatCurrency(item.supplier_cost) : "—"}
                            </TableCell>
                            <TableCell className={`py-2 px-3 text-sm text-right font-medium whitespace-nowrap ${sobraColor(sobraPct)}`}>
                              {formatCurrency(sobra)} {sobraIcon(sobraPct)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
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
        <Button onClick={() => setProposalOpen(true)}>
          <FileText className="mr-2 h-4 w-4" /> Gerar Proposta
        </Button>
      </div>

      {proposalOpen && (
        <GenerateProposalModal
          open={proposalOpen}
          onClose={() => setProposalOpen(false)}
          budget={budget}
          items={budget.budget_items}
        />
      )}
    </div>
  );
}
