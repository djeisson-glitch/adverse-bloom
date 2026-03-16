import { useState } from "react";
import { Plus, DollarSign, AlertTriangle, CheckCircle, Pencil, Trash2, CreditCard } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import type { Budget, BudgetItem } from "@/hooks/useBudgets";

interface ProjectCost {
  id: string;
  budget_id: string;
  budget_item_id: string | null;
  category: string | null;
  description: string | null;
  amount: number;
  supplier: string | null;
  supplier_name: string | null;
  supplier_doc: string | null;
  payment_date: string | null;
  service_date: string | null;
  status: string;
  sent_to_conta_azul: boolean;
  conta_azul_id: string | null;
  created_at: string;
}

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
  pending: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  paid: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  overdue: "bg-destructive/15 text-destructive",
};

export function CostEntryTab({ budget, items }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<ProjectCost | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState("");
  const [budgetItemId, setBudgetItemId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [supplierName, setSupplierName] = useState("");
  const [supplierDoc, setSupplierDoc] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [sentToContaAzul, setSentToContaAzul] = useState(false);

  const { data: costs = [] } = useQuery({
    queryKey: ["project_costs", budget.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_costs")
        .select("*")
        .eq("budget_id", budget.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProjectCost[];
    },
  });

  const resetForm = () => {
    setCategory("");
    setBudgetItemId(null);
    setDescription("");
    setAmount(0);
    setSupplierName("");
    setSupplierDoc("");
    setPaymentDate("");
    setServiceDate("");
    setStatus("pending");
    setSentToContaAzul(false);
    setEditingCost(null);
  };

  const openEdit = (cost: ProjectCost) => {
    setEditingCost(cost);
    setCategory(cost.category || "");
    setBudgetItemId(cost.budget_item_id);
    setDescription(cost.description || "");
    setAmount(cost.amount);
    setSupplierName(cost.supplier_name || cost.supplier || "");
    setSupplierDoc(cost.supplier_doc || "");
    setPaymentDate(cost.payment_date || "");
    setServiceDate(cost.service_date || "");
    setStatus(cost.status || "pending");
    setSentToContaAzul(cost.sent_to_conta_azul);
    setOpen(true);
  };

  const saveCost = useMutation({
    mutationFn: async () => {
      const payload = {
        budget_id: budget.id,
        budget_item_id: budgetItemId,
        category,
        description,
        amount,
        supplier: supplierName || null,
        supplier_name: supplierName || null,
        supplier_doc: supplierDoc || null,
        payment_date: paymentDate || null,
        service_date: serviceDate || null,
        status,
        sent_to_conta_azul: sentToContaAzul,
      };
      if (editingCost) {
        const { error } = await supabase.from("project_costs").update(payload).eq("id", editingCost.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("project_costs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_costs", budget.id] });
      toast({ title: editingCost ? "Custo atualizado!" : "Custo lançado!" });
      resetForm();
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar custo", description: err.message, variant: "destructive" });
    },
  });

  const deleteCost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_costs", budget.id] });
      toast({ title: "Custo excluído." });
      setDeleteId(null);
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_costs").update({ status: "paid" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_costs", budget.id] });
      toast({ title: "Marcado como pago!" });
    },
  });

  const totalExecutado = costs.reduce((s, c) => s + c.amount, 0);
  const supplierTotal = items.filter(i => i.has_supplier_cost).reduce((s, i) => s + i.supplier_cost, 0);
  const saldo = supplierTotal - totalExecutado;
  const categories = [...new Set(items.map(i => i.category))];

  // Item info for selected budget_item_id
  const selectedItem = budgetItemId ? items.find(i => i.id === budgetItemId) : null;
  const executedForItem = budgetItemId
    ? costs.filter(c => c.budget_item_id === budgetItemId && c.id !== (editingCost?.id || "")).reduce((s, c) => s + c.amount, 0)
    : 0;

  // Check if amount exceeds 200% of budgeted
  const budgetedForItem = selectedItem?.supplier_cost ?? 0;
  const wouldExceed200 = budgetedForItem > 0 && (executedForItem + amount) > budgetedForItem * 2;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Custos Reais
            </CardTitle>
            <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Novo Custo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingCost ? "Editar Custo" : "Adicionar Custo Real"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Select value={category} onValueChange={(v) => { setCategory(v); setBudgetItemId(null); }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Item relacionado (opcional)</Label>
                    <Select value={budgetItemId || "_none"} onValueChange={v => setBudgetItemId(v === "_none" ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {items.filter(i => i.category === category).map(i => (
                          <SelectItem key={i.id} value={i.id || ""}>{i.item_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedItem && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Orçado: {formatCurrency(selectedItem.supplier_cost)} | Já executado: {formatCurrency(executedForItem)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Diária Rodrigo - 2 dias" />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Fornecedor</Label>
                    <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Nome / Razão Social" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CPF/CNPJ (opcional)</Label>
                    <Input value={supplierDoc} onChange={e => setSupplierDoc(e.target.value)} placeholder="000.000.000-00" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Valor R$</Label>
                      <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} min={0} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Data do serviço</Label>
                      <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Data pagamento</Label>
                      <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="paid">Pago</SelectItem>
                          <SelectItem value="overdue">Atrasado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sentToContaAzul}
                      onChange={e => setSentToContaAzul(e.target.checked)}
                      className="rounded border-border"
                    />
                    <Label className="text-sm">Enviar para Conta Azul</Label>
                  </div>

                  {wouldExceed200 && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Valor ultrapassa 200% do orçado ({formatCurrency(budgetedForItem)}). Confirme antes de salvar.
                    </div>
                  )}

                  {totalExecutado > supplierTotal && !editingCost && (
                    <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--warning))]/10 p-3 text-sm text-[hsl(var(--warning))]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Custo executado ({formatCurrency(totalExecutado)}) já ultrapassou o orçado ({formatCurrency(supplierTotal)}).
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => saveCost.mutate()}
                    disabled={saveCost.isPending || !category || !amount}
                  >
                    {editingCost ? "Atualizar" : "Salvar Custo"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-primary/10 p-3">
              <p className="text-xs text-muted-foreground">Orçado (fornecedores)</p>
              <p className="font-semibold text-primary">{formatCurrency(supplierTotal)}</p>
            </div>
            <div className={`rounded-lg p-3 ${totalExecutado > supplierTotal ? "bg-destructive/10" : "bg-[hsl(var(--success))]/10"}`}>
              <p className="text-xs text-muted-foreground">Executado</p>
              <p className={`font-semibold ${totalExecutado > supplierTotal ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
                {formatCurrency(totalExecutado)}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className={`font-semibold ${saldo >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {formatCurrency(saldo)}
                {saldo >= 0 && supplierTotal > 0 && (
                  <span className="text-xs font-normal ml-1">
                    ({((saldo / supplierTotal) * 100).toFixed(0)}% sob controle)
                  </span>
                )}
              </p>
            </div>
          </div>

          {totalExecutado > supplierTotal && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Custo executado ultrapassou o orçado</p>
                <p className="text-xs">Impacto na margem: {formatCurrency(saldo)}</p>
              </div>
            </div>
          )}

          {/* Cost list */}
          {costs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum custo lançado ainda.</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {costs.map(cost => {
                const relatedItem = cost.budget_item_id ? items.find(i => i.id === cost.budget_item_id) : null;
                return (
                  <div key={cost.id} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm text-foreground">
                          {cost.description || cost.category}
                        </p>
                        {relatedItem && (
                          <p className="text-xs text-muted-foreground">
                            Item: {relatedItem.item_name} · Orçado: {formatCurrency(relatedItem.supplier_cost)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{formatCurrency(cost.amount)}</span>
                        <Badge className={`text-[10px] ${statusColors[cost.status] || ""}`}>
                          {statusLabels[cost.status] || cost.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-3">
                        {(cost.supplier_name || cost.supplier) && (
                          <span>Fornecedor: {cost.supplier_name || cost.supplier}</span>
                        )}
                        {cost.service_date && <span>Serviço: {formatDate(cost.service_date)}</span>}
                        {cost.payment_date && <span>Pagamento: {formatDate(cost.payment_date)}</span>}
                      </div>
                      {cost.sent_to_conta_azul && (
                        <Badge variant="secondary" className="text-[10px]">✓ Conta Azul</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(cost)}>
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      {cost.status !== "paid" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-[hsl(var(--success))]" onClick={() => markPaid.mutate(cost.id)}>
                          <CreditCard className="h-3 w-3 mr-1" /> Marcar como Pago
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setDeleteId(cost.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir custo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteCost.mutate(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
