import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, GripVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatPercent } from "@/lib/format";
import { calcBudgetTotals } from "@/lib/budgetCalc";
import { useBudgetWithItems, useSaveBudget, useBudgetSettings, type BudgetItem } from "@/hooks/useBudgets";

const DEFAULT_CATEGORIES = ["PRODUÇÃO", "PÓS-PRODUÇÃO", "LOGÍSTICA"];
const BV_OPTIONS = [0, 10, 15, 20];

function emptyItem(category: string, orderIndex: number): BudgetItem {
  return {
    category,
    item_name: "",
    client_days: 1,
    client_people: 1,
    client_unit_price: 0,
    client_price: 0,
    supplier_days: 0,
    supplier_people: 0,
    supplier_unit_price: 0,
    supplier_cost: 0,
    margin_value: 0,
    margin_percent: 0,
    order_index: orderIndex,
  };
}

interface Props {
  budgetId: string | null;
  onClose: () => void;
}

export function BudgetForm({ budgetId, onClose }: Props) {
  const { data: existing } = useBudgetWithItems(budgetId);
  const { data: settings } = useBudgetSettings();
  const saveBudget = useSaveBudget();

  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [markupPercent, setMarkupPercent] = useState(35);
  const [taxPercent, setTaxPercent] = useState(9.5);
  const [bvPercent, setBvPercent] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(4);
  const [discount, setDiscount] = useState(0);
  const [addition, setAddition] = useState(0);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");

  // Load existing budget or defaults
  useEffect(() => {
    if (existing) {
      setProjectName(existing.project_name);
      setClientName(existing.client_name);
      setMarkupPercent(existing.markup_percent);
      setTaxPercent(existing.tax_percent);
      setBvPercent(existing.bv_percent);
      setCommissionPercent(existing.commission_percent);
      setDiscount(existing.discount);
      setAddition(existing.addition);
      setItems(existing.budget_items || []);
      const cats = [...new Set((existing.budget_items || []).map((i) => i.category))];
      if (cats.length > 0) {
        setCategories([...new Set([...DEFAULT_CATEGORIES, ...cats])]);
      }
    } else if (settings) {
      setMarkupPercent(settings.markup_default);
      setTaxPercent(settings.tax_default);
      setCommissionPercent(settings.commission_default);
    }
  }, [existing, settings]);

  const totals = useMemo(
    () => calcBudgetTotals(items, markupPercent, taxPercent, bvPercent, commissionPercent, discount, addition),
    [items, markupPercent, taxPercent, bvPercent, commissionPercent, discount, addition]
  );

  const updateItem = (index: number, field: keyof BudgetItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      // Recalculate client_price
      copy[index].client_price = copy[index].client_days * copy[index].client_people * copy[index].client_unit_price;
      // Recalculate supplier_cost
      copy[index].supplier_cost = copy[index].supplier_days * copy[index].supplier_people * copy[index].supplier_unit_price;
      const cp = copy[index].client_price;
      const sc = copy[index].supplier_cost;
      copy[index].margin_value = cp - sc;
      copy[index].margin_percent = cp > 0 ? ((cp - sc) / cp) * 100 : 0;
      return copy;
    });
  };

  const addItem = (category: string) => {
    setItems((prev) => [...prev, emptyItem(category, prev.length)]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addCategory = () => {
    const cat = newCategory.trim().toUpperCase();
    if (cat && !categories.includes(cat)) {
      setCategories((prev) => [...prev, cat]);
      setNewCategory("");
    }
  };

  const handleSave = (status: string) => {
    saveBudget.mutate(
      {
        budget: {
          ...(budgetId ? { id: budgetId } : {}),
          project_name: projectName,
          client_name: clientName,
          status,
          markup_percent: markupPercent,
          tax_percent: taxPercent,
          bv_percent: bvPercent,
          commission_percent: commissionPercent,
          discount,
          addition,
          subtotal_1: totals.subtotal1,
          subtotal_2: totals.subtotal2,
          tax_value: totals.taxValue,
          bv_value: totals.bvValue,
          commission_value: totals.commissionValue,
          total_value: totals.totalValue,
          margin_value: totals.marginValue,
          margin_percent: totals.marginPercent,
          created_by: null,
        },
        items,
      },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {budgetId ? "Editar Orçamento" : "Novo Orçamento"}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left Column — 60% */}
        <div className="lg:col-span-3 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome do projeto</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex: Campanha X" />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Empresa Y" />
              </div>
            </CardContent>
          </Card>

          {/* Items by Category */}
          {categories.map((cat) => {
            const catItems = items
              .map((item, idx) => ({ item, idx }))
              .filter(({ item }) => item.category === cat);

            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{cat}</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => addItem(cat)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {catItems.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-3">Nenhum item nesta categoria.</p>
                  )}
                  {catItems.map(({ item, idx }) => {
                    const marginOk = item.margin_percent >= 20;
                    return (
                      <div key={idx} className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
                        <div className="grid gap-3 sm:grid-cols-4">
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs">Nome</Label>
                            <Input
                              value={item.item_name}
                              onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                              placeholder="Ex: Operador de câmera"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Dias</Label>
                            <Input
                              type="number"
                              value={item.days}
                              onChange={(e) => updateItem(idx, "days", Number(e.target.value))}
                              className="h-8 text-sm"
                              min={0}
                              step={0.1}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Pessoas</Label>
                            <Input
                              type="number"
                              value={item.people_count}
                              onChange={(e) => updateItem(idx, "people_count", Number(e.target.value))}
                              className="h-8 text-sm"
                              min={1}
                              step={1}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">Valor unitário R$</Label>
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                              className="h-8 text-sm"
                              min={0}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Total cliente R$</Label>
                            <Input
                              type="number"
                              value={item.client_price}
                              className="h-8 text-sm bg-muted"
                              readOnly
                              tabIndex={-1}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Paga fornecedor R$</Label>
                            <Input
                              type="number"
                              value={item.supplier_cost}
                              onChange={(e) => updateItem(idx, "supplier_cost", Number(e.target.value))}
                              className="h-8 text-sm"
                              min={0}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium ${marginOk ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`}
                            >
                              {formatCurrency(item.margin_value)} ({formatPercent(item.margin_percent)})
                              {marginOk ? " ✅" : " ⚠️"}
                            </span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}

          {/* Add Category */}
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nova categoria..."
              className="max-w-xs"
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <Button variant="outline" onClick={addCategory}>
              <Plus className="h-4 w-4 mr-1" /> Nova Categoria
            </Button>
          </div>
        </div>

        {/* Right Column — 40% */}
        <div className="lg:col-span-2 space-y-6">
          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Markup %</Label>
                  <Input type="number" value={markupPercent} onChange={(e) => setMarkupPercent(Number(e.target.value))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Imposto %</Label>
                  <Input type="number" value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">BV %</Label>
                  <Select value={String(bvPercent)} onValueChange={(v) => setBvPercent(Number(v))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BV_OPTIONS.map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comissão %</Label>
                  <Input type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value))} className="h-8 text-sm" />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Desconto R$</Label>
                  <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Acréscimo R$</Label>
                  <Input type="number" value={addition} onChange={(e) => setAddition(Number(e.target.value))} className="h-8 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profitability */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rentabilidade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Sub-Total 1" value={formatCurrency(totals.subtotal1)} />
              <Row label={`+ Markup (${markupPercent}%)`} value={formatCurrency(totals.markupValue)} />
              <Separator />
              <Row label="Sub-Total 2" value={formatCurrency(totals.subtotal2)} bold />
              <Row label={`+ Imposto (${taxPercent}%)`} value={formatCurrency(totals.taxValue)} />
              <Row label={`+ BV (${bvPercent}%)`} value={formatCurrency(totals.bvValue)} />
              <Row label={`+ Comissão (${commissionPercent}%)`} value={formatCurrency(totals.commissionValue)} />
              {discount > 0 && <Row label="- Desconto" value={`-${formatCurrency(discount)}`} />}
              {addition > 0 && <Row label="+ Acréscimo" value={formatCurrency(addition)} />}
              <Separator />
              <Row label="TOTAL" value={formatCurrency(totals.totalValue)} bold className="text-base" />

              <div className="mt-4 rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">💰 Margem Real</p>
                <p
                  className={`text-lg font-bold ${
                    totals.marginPercent >= 20
                      ? "text-[hsl(var(--success))]"
                      : totals.marginPercent >= 10
                      ? "text-[hsl(var(--warning))]"
                      : "text-destructive"
                  }`}
                >
                  {formatCurrency(totals.marginValue)} ({formatPercent(totals.marginPercent)})
                </p>
              </div>

              {/* Category Breakdown */}
              {Object.keys(totals.categoryBreakdown).length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Breakdown por categoria</p>
                  {Object.entries(totals.categoryBreakdown).map(([cat, val]) => {
                    const pct = totals.subtotal1 > 0 ? (val / totals.subtotal1) * 100 : 0;
                    return (
                      <div key={cat} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{cat}</span>
                        <span className="text-xs font-medium">{formatPercent(pct)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="secondary" onClick={() => handleSave("draft")} disabled={saveBudget.isPending}>
          Salvar Rascunho
        </Button>
        <Button onClick={() => handleSave("approved")} disabled={saveBudget.isPending}>
          <Check className="mr-2 h-4 w-4" />
          Aprovar
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  className = "",
}: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span className={`text-muted-foreground ${bold ? "font-semibold text-foreground" : ""}`}>{label}</span>
      <span className={bold ? "font-bold text-foreground" : ""}>{value}</span>
    </div>
  );
}
