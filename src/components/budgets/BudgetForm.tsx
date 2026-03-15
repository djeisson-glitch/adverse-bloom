import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Check, Copy, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { calcBudgetTotals } from "@/lib/budgetCalc";
import {
  useBudgetWithItems,
  useSaveBudget,
  useBudgetSettings,
  useCreateNewVersion,
  useBudgetVersions,
  type BudgetItem,
} from "@/hooks/useBudgets";

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
    has_supplier_cost: false,
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
  onOpenVersion?: (id: string) => void;
}

/** Numeric input that strips leading zeros */
function NumInput({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Input
      type="number"
      value={value || ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? 0 : Number(raw));
      }}
      {...rest}
    />
  );
}

export function BudgetForm({ budgetId, onClose, onOpenVersion }: Props) {
  const { data: existing } = useBudgetWithItems(budgetId);
  const { data: settings } = useBudgetSettings();
  const saveBudget = useSaveBudget();
  const createNewVersion = useCreateNewVersion();

  const { data: versions = [] } = useBudgetVersions(existing?.budget_number ?? null);

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

  // Commission split
  const [djEnabled, setDjEnabled] = useState(true);
  const [djPercent, setDjPercent] = useState(3);
  const [robertEnabled, setRobertEnabled] = useState(true);
  const [robertPercent, setRobertPercent] = useState(3);

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
      if ('commission_djeisson_percent' in settings) {
        setDjPercent((settings as any).commission_djeisson_percent ?? 3);
        setRobertPercent((settings as any).commission_robert_percent ?? 3);
        setDjEnabled((settings as any).commission_djeisson_enabled ?? true);
        setRobertEnabled((settings as any).commission_robert_enabled ?? true);
      }
    }
  }, [existing, settings]);

  // Auto-calc commission from split
  useEffect(() => {
    const total = (djEnabled ? djPercent : 0) + (robertEnabled ? robertPercent : 0);
    setCommissionPercent(total);
  }, [djEnabled, djPercent, robertEnabled, robertPercent]);

  const totals = useMemo(
    () => calcBudgetTotals(items, markupPercent, taxPercent, bvPercent, commissionPercent, discount, addition),
    [items, markupPercent, taxPercent, bvPercent, commissionPercent, discount, addition]
  );

  const recalcItem = (item: BudgetItem): BudgetItem => {
    const cp = item.client_days * item.client_people * item.client_unit_price;
    const sc = item.has_supplier_cost
      ? item.supplier_days * item.supplier_people * item.supplier_unit_price
      : 0;
    return {
      ...item,
      client_price: cp,
      supplier_cost: sc,
      supplier_days: item.has_supplier_cost ? item.supplier_days : 0,
      supplier_people: item.has_supplier_cost ? item.supplier_people : 0,
      supplier_unit_price: item.has_supplier_cost ? item.supplier_unit_price : 0,
      margin_value: cp - sc,
      margin_percent: cp > 0 ? ((cp - sc) / cp) * 100 : 0,
    };
  };

  const updateItem = (index: number, field: keyof BudgetItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = recalcItem({ ...copy[index], [field]: value });
      return copy;
    });
  };

  const toggleSupplier = (index: number, checked: boolean) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], has_supplier_cost: checked };
      if (!checked) {
        item.supplier_days = 0;
        item.supplier_people = 0;
        item.supplier_unit_price = 0;
      }
      copy[index] = recalcItem(item);
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
          budget_number: existing?.budget_number ?? null,
          version: existing?.version ?? 1,
          parent_budget_id: existing?.parent_budget_id ?? null,
          is_latest_version: existing?.is_latest_version ?? true,
        },
        items,
      },
      { onSuccess: () => onClose() }
    );
  };

  const handleNewVersion = () => {
    if (!budgetId) return;
    createNewVersion.mutate(budgetId, {
      onSuccess: (newId) => {
        if (onOpenVersion) {
          onOpenVersion(newId);
        }
      },
    });
  };

  const isApproved = existing?.status === "approved";
  const budgetLabel = existing?.budget_number
    ? `#${existing.budget_number} v${existing.version}`
    : "Novo";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                Orçamento {budgetLabel}
              </h1>
              {existing && (
                <Badge variant={existing.status === "approved" ? "default" : "secondary"}>
                  {existing.status === "approved" ? "Aprovado" : existing.status === "rejected" ? "Rejeitado" : "Rascunho"}
                </Badge>
              )}
            </div>
            {existing && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {existing.project_name} — {existing.client_name}
              </p>
            )}
          </div>
          {budgetId && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleNewVersion} disabled={createNewVersion.isPending}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Nova Versão
              </Button>
              {existing?.budget_number && versions.length > 1 && (
                <VersionHistoryModal
                  versions={versions}
                  currentId={budgetId}
                  onOpenVersion={onOpenVersion}
                />
              )}
            </div>
          )}
        </div>

        {/* Version timeline */}
        {existing?.budget_number && versions.length > 1 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-14">
            <span>Histórico:</span>
            {versions.map((v, i) => (
              <span key={v.id} className="flex items-center gap-1">
                {i > 0 && <span>→</span>}
                <span className={v.id === budgetId ? "text-primary font-semibold" : ""}>
                  v{v.version} ({formatDate(v.created_at)})
                </span>
                {v.is_latest_version && <span>✓</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left Column */}
        <div className="lg:col-span-3 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome do projeto</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex: Campanha X" disabled={isApproved} />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Empresa Y" disabled={isApproved} />
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
                    {!isApproved && (
                      <Button variant="outline" size="sm" onClick={() => addItem(cat)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {catItems.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-3">Nenhum item nesta categoria.</p>
                  )}
                  {catItems.map(({ item, idx }) => (
                    <BudgetItemCard
                      key={idx}
                      item={item}
                      onUpdate={(field, value) => updateItem(idx, field, value)}
                      onToggleSupplier={(checked) => toggleSupplier(idx, checked)}
                      onRemove={() => removeItem(idx)}
                      readOnly={isApproved}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}

          {/* Add Category */}
          {!isApproved && (
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
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Markup %</Label>
                  <NumInput value={markupPercent} onChange={setMarkupPercent} className="h-8 text-sm" disabled={isApproved} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Imposto %</Label>
                  <NumInput value={taxPercent} onChange={setTaxPercent} className="h-8 text-sm" disabled={isApproved} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">BV %</Label>
                  <Select value={String(bvPercent)} onValueChange={(v) => setBvPercent(Number(v))} disabled={isApproved}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BV_OPTIONS.map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Commission Split */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comissão — Distribuição</p>
                <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={djEnabled} onCheckedChange={(c) => setDjEnabled(!!c)} disabled={isApproved} />
                    <span className="text-sm flex-1">Djêisson</span>
                    <NumInput value={djPercent} onChange={setDjPercent} className="h-7 text-sm w-16" min={0} disabled={isApproved} />
                    <span className="text-xs text-muted-foreground">%</span>
                    <span className="text-xs font-medium w-20 text-right">
                      {djEnabled ? formatCurrency(totals.subtotal2 * (djPercent / 100)) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox checked={robertEnabled} onCheckedChange={(c) => setRobertEnabled(!!c)} disabled={isApproved} />
                    <span className="text-sm flex-1">Robert</span>
                    <NumInput value={robertPercent} onChange={setRobertPercent} className="h-7 text-sm w-16" min={0} disabled={isApproved} />
                    <span className="text-xs text-muted-foreground">%</span>
                    <span className="text-xs font-medium w-20 text-right">
                      {robertEnabled ? formatCurrency(totals.subtotal2 * (robertPercent / 100)) : "—"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total comissão</span>
                    <span className="font-semibold">{commissionPercent}% ({formatCurrency(totals.commissionValue)})</span>
                  </div>
                </div>
              </div>

              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Desconto R$</Label>
                  <NumInput value={discount} onChange={setDiscount} className="h-8 text-sm" disabled={isApproved} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Acréscimo R$</Label>
                  <NumInput value={addition} onChange={setAddition} className="h-8 text-sm" disabled={isApproved} />
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

              <div className="mt-2 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">TOTAL</p>
                <p className="text-[2.5rem] leading-tight font-bold text-foreground">
                  {formatCurrency(totals.totalValue)}
                </p>
              </div>

              <div className="mt-3 rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">💰 Margem Real</p>
                <p className={`text-xl font-semibold ${marginColor(totals.marginPercent)}`}>
                  {formatCurrency(totals.marginValue)} ({formatPercent(totals.marginPercent)})
                </p>
              </div>

              {/* Cost Breakdown */}
              <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">📊 Custos Reais do Projeto</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">├ Custos de fornecedores</span>
                    <span className="font-medium">{formatCurrency(totals.supplierTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">├ BV</span>
                    <span className="font-medium">{formatCurrency(totals.bvValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">├ Comissão sócios</span>
                    <span className="font-medium">{formatCurrency(totals.commissionValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60 italic">└ Impostos: {formatCurrency(totals.taxValue)}</span>
                    <span className="text-muted-foreground/60 italic text-xs">não alocado</span>
                  </div>
                </div>
                <Separator className="my-1.5" />
                <div className="flex justify-between font-semibold text-sm">
                  <span>MARGEM REAL</span>
                  <span className={marginColor(totals.marginPercent)}>
                    {formatCurrency(totals.marginValue)} ({formatPercent(totals.marginPercent)})
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1 leading-tight">
                  Margem Real = lucro após custos variáveis (fornecedores, BV, comissão). Impostos não são alocados por projeto (custo fixo operacional).
                </p>
              </div>

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
        {isApproved ? (
          <Button onClick={handleNewVersion} disabled={createNewVersion.isPending}>
            <Copy className="mr-2 h-4 w-4" />
            Criar Nova Versão para Editar
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => handleSave("draft")} disabled={saveBudget.isPending}>
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSave("approved")} disabled={saveBudget.isPending}>
              <Check className="mr-2 h-4 w-4" />
              Aprovar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Version History Modal ── */

function VersionHistoryModal({
  versions,
  currentId,
  onOpenVersion,
}: {
  versions: any[];
  currentId: string;
  onOpenVersion?: (id: string) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-3.5 w-3.5 mr-1" /> {versions.length} versões
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico — Orçamento #{versions[0]?.budget_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {[...versions].reverse().map((v) => (
            <div
              key={v.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                v.id === currentId ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                {v.is_latest_version && <span className="text-[hsl(var(--success))]">✓</span>}
                <span className="font-medium text-sm">
                  v{v.version} — {formatDate(v.created_at)}
                </span>
                {v.is_latest_version && (
                  <Badge variant="default" className="text-xs">ATUAL</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{formatCurrency(v.total_value)}</span>
                {v.id !== currentId && onOpenVersion && (
                  <Button variant="ghost" size="sm" onClick={() => onOpenVersion(v.id)}>
                    Ver
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Helpers ── */

function marginColor(percent: number) {
  if (percent >= 35) return "text-[hsl(var(--success))]";
  if (percent >= 15) return "text-[hsl(var(--warning))]";
  return "text-destructive";
}

function marginIcon(percent: number) {
  if (percent >= 35) return "✅";
  if (percent >= 15) return "⚠️";
  return "❌";
}

/* ── Item Card ── */

function BudgetItemCard({
  item,
  onUpdate,
  onToggleSupplier,
  onRemove,
  readOnly,
}: {
  item: BudgetItem;
  onUpdate: (field: keyof BudgetItem, value: any) => void;
  onToggleSupplier: (checked: boolean) => void;
  onRemove: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      {/* Name + Delete */}
      <div className="flex items-center gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Nome</Label>
          <Input
            value={item.item_name}
            onChange={(e) => onUpdate("item_name", e.target.value)}
            placeholder="Ex: Operador de câmera"
            className="h-8 text-sm"
            disabled={readOnly}
          />
        </div>
        {!readOnly && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive mt-5" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* COBRA DO CLIENTE */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cobra do cliente</p>
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Dias</Label>
            <NumInput value={item.client_days} onChange={(v) => onUpdate("client_days", v)} className="h-8 text-sm" min={0} step={0.1} disabled={readOnly} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pessoas</Label>
            <NumInput value={item.client_people} onChange={(v) => onUpdate("client_people", v)} className="h-8 text-sm" min={1} step={1} disabled={readOnly} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor unit. R$</Label>
            <NumInput value={item.client_unit_price} onChange={(v) => onUpdate("client_unit_price", v)} className="h-8 text-sm" min={0} disabled={readOnly} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Total R$</Label>
            <Input type="number" value={item.client_price} className="h-8 text-sm bg-muted" readOnly tabIndex={-1} />
          </div>
        </div>
      </div>

      {/* SUPPLIER TOGGLE */}
      <div
        className={`rounded-lg border transition-all duration-200 ${
          item.has_supplier_cost ? "border-border bg-background p-3" : "border-border/50 p-3"
        }`}
      >
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={item.has_supplier_cost}
            onCheckedChange={(checked) => onToggleSupplier(!!checked)}
            disabled={readOnly}
          />
          <span className="text-xs font-medium text-muted-foreground">Tem custo de fornecedor?</span>
        </label>

        {item.has_supplier_cost && (
          <div className="mt-3 space-y-1.5 animate-fade-in">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paga fornecedor</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Dias</Label>
                <NumInput value={item.supplier_days} onChange={(v) => onUpdate("supplier_days", v)} className="h-8 text-sm" min={0} step={0.1} disabled={readOnly} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pessoas</Label>
                <NumInput value={item.supplier_people} onChange={(v) => onUpdate("supplier_people", v)} className="h-8 text-sm" min={0} step={1} disabled={readOnly} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor unit. R$</Label>
                <NumInput value={item.supplier_unit_price} onChange={(v) => onUpdate("supplier_unit_price", v)} className="h-8 text-sm" min={0} disabled={readOnly} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Total R$</Label>
                <Input type="number" value={item.supplier_cost} className="h-8 text-sm bg-muted" readOnly tabIndex={-1} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SOBRA */}
      <div className="flex items-center justify-end pt-1">
        <span className={`text-sm font-semibold ${marginColor(item.margin_percent)}`}>
          Sobra: {formatCurrency(item.margin_value)} ({formatPercent(item.margin_percent)}) {marginIcon(item.margin_percent)}
        </span>
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
