import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSuppliersByBudget, useSaveSupplier, useUpdateSupplierStatus, type Supplier } from "@/hooks/useSuppliers";
import type { BudgetItem, Budget } from "@/hooks/useBudgets";
import { Truck, Save } from "lucide-react";

interface Props {
  budget: Budget;
  items: BudgetItem[];
}

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
};

const statusColors: Record<string, string> = {
  pending: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]",
  paid: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]",
  overdue: "bg-destructive/20 text-destructive",
};

export function SupplierManagement({ budget, items }: Props) {
  const { data: suppliers = [] } = useSuppliersByBudget(budget.id);
  const saveSupplier = useSaveSupplier();
  const updateStatus = useUpdateSupplierStatus();

  const supplierItems = items.filter((i) => i.has_supplier_cost && i.supplier_cost > 0);

  if (supplierItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhum item com custo de fornecedor neste orçamento.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          Fornecedores a Pagar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {supplierItems.map((item) => {
          const existing = suppliers.find((s) => s.budget_item_id === item.id);
          return (
            <SupplierItemCard
              key={item.id}
              item={item}
              budgetId={budget.id}
              supplier={existing}
              onSave={(data) => saveSupplier.mutate(data)}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              saving={saveSupplier.isPending}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function SupplierItemCard({
  item,
  budgetId,
  supplier,
  onSave,
  onStatusChange,
  saving,
}: {
  item: BudgetItem;
  budgetId: string;
  supplier?: Supplier;
  onSave: (data: any) => void;
  onStatusChange: (id: string, status: string) => void;
  saving: boolean;
}) {
  const [registered, setRegistered] = useState(!!supplier);
  const [name, setName] = useState(supplier?.supplier_name ?? "");
  const [doc, setDoc] = useState(supplier?.supplier_doc ?? "");
  const [paymentDate, setPaymentDate] = useState(supplier?.payment_date ?? "");
  const [status, setStatus] = useState(supplier?.status ?? "pending");
  const [sentCA, setSentCA] = useState(supplier?.sent_to_conta_azul ?? false);

  const handleSave = () => {
    onSave({
      ...(supplier?.id ? { id: supplier.id } : {}),
      budget_id: budgetId,
      budget_item_id: item.id,
      supplier_name: name,
      supplier_doc: doc || null,
      amount: item.supplier_cost,
      payment_date: paymentDate || null,
      status,
      sent_to_conta_azul: sentCA,
    });
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{item.item_name || "Item sem nome"}</p>
          <p className="text-xs text-muted-foreground">{item.category}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[hsl(var(--warning))]">{formatCurrency(item.supplier_cost)}</p>
          {supplier && (
            <Badge className={`text-[10px] ${statusColors[supplier.status] ?? ""}`}>
              {statusLabels[supplier.status] ?? supplier.status}
            </Badge>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <Checkbox checked={registered} onCheckedChange={(c) => setRegistered(!!c)} />
        <span className="text-xs font-medium text-muted-foreground">Fornecedor cadastrado?</span>
      </label>

      {registered && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-3 animate-fade-in">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados do Fornecedor</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome/Razão Social</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPF/CNPJ</Label>
              <Input value={doc} onChange={(e) => setDoc(e.target.value)} className="h-8 text-sm" placeholder="000.000.000-00" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor R$</Label>
              <Input value={formatCurrency(item.supplier_cost)} className="h-8 text-sm bg-muted" readOnly />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data prevista</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => {
                setStatus(v);
                if (supplier?.id) onStatusChange(supplier.id, v);
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={sentCA} onCheckedChange={(c) => setSentCA(!!c)} />
              <span className="text-xs text-muted-foreground">Já lançado no Conta Azul</span>
            </label>
            <Button size="sm" onClick={handleSave} disabled={saving || !name}>
              <Save className="h-3.5 w-3.5 mr-1" /> Salvar Fornecedor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
