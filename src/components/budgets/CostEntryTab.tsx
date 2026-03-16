import { useState, useMemo } from "react";
import { Plus, DollarSign, AlertTriangle, CheckCircle, Trash2, CreditCard, Search, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useSupplierContacts, useCreateSupplierContact, useTouchSupplierContact, type SupplierContact } from "@/hooks/useSupplierContacts";
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

const statusLabels: Record<string, string> = { pending: "Pendente", paid: "Pago", overdue: "Atrasado" };
const statusIcons: Record<string, string> = { pending: "🟡", paid: "✅", overdue: "🔴" };

export function CostEntryTab({ budget, items }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingCost, setEditingCost] = useState<ProjectCost | null>(null);

  // Form state
  const [budgetItemId, setBudgetItemId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [supplierName, setSupplierName] = useState("");
  const [supplierDoc, setSupplierDoc] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [sentToContaAzul, setSentToContaAzul] = useState(false);

  // Supplier search
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDoc, setNewDoc] = useState("");
  const [newType, setNewType] = useState("individual");

  const { data: supplierContacts = [] } = useSupplierContacts();
  const createContact = useCreateSupplierContact();
  const touchContact = useTouchSupplierContact();

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
    setSupplierSearch("");
  };

  const loadCostIntoForm = (cost: ProjectCost) => {
    setEditingCost(cost);
    setBudgetItemId(cost.budget_item_id);
    setDescription(cost.description || "");
    setAmount(cost.amount);
    setSupplierName(cost.supplier_name || cost.supplier || "");
    setSupplierDoc(cost.supplier_doc || "");
    setPaymentDate(cost.payment_date || "");
    setServiceDate(cost.service_date || "");
    setStatus(cost.status || "pending");
    setSentToContaAzul(cost.sent_to_conta_azul);
    setSupplierSearch(cost.supplier_name || cost.supplier || "");
  };

  const saveCost = useMutation({
    mutationFn: async () => {
      const selectedItem = budgetItemId ? items.find(i => i.id === budgetItemId) : null;
      const category = selectedItem?.category || "DIVERSOS";
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

  // Selected item info
  const selectedItem = budgetItemId ? items.find(i => i.id === budgetItemId) : null;
  const executedForItem = budgetItemId
    ? costs.filter(c => c.budget_item_id === budgetItemId && c.id !== (editingCost?.id || "")).reduce((s, c) => s + c.amount, 0)
    : 0;
  const budgetedForItem = selectedItem?.supplier_cost ?? 0;
  const wouldExceed200 = budgetedForItem > 0 && (executedForItem + amount) > budgetedForItem * 2;

  // Supplier filtering
  const filteredContacts = useMemo(() => {
    const q = supplierSearch.toLowerCase();
    if (!q) return supplierContacts;
    return supplierContacts.filter(s => s.name.toLowerCase().includes(q));
  }, [supplierContacts, supplierSearch]);

  const genericContacts = filteredContacts.filter(s => s.is_generic);
  const specificContacts = filteredContacts.filter(s => !s.is_generic);

  const selectSupplier = (contact: SupplierContact) => {
    setSupplierName(contact.name);
    setSupplierDoc(contact.document || "");
    setSupplierSearch(contact.name);
    setSupplierPopoverOpen(false);
    touchContact.mutate(contact.id);
  };

  const handleCreateSupplier = async () => {
    if (!newName.trim()) return;
    const result = await createContact.mutateAsync({ name: newName, document: newDoc, type: newType });
    setSupplierName(result.name);
    setSupplierDoc(result.document || "");
    setSupplierSearch(result.name);
    setNewSupplierOpen(false);
    setNewName("");
    setNewDoc("");
    setNewType("individual");
  };

  const itemsWithSupplier = items.filter(i => i.has_supplier_cost);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Custos Reais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-primary/10 p-3">
              <p className="text-xs text-muted-foreground">Orçado</p>
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
                  <span className="text-xs font-normal ml-1">({((saldo / supplierTotal) * 100).toFixed(0)}%)</span>
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

          {/* Split layout: form left, list right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT — form */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                {editingCost ? "Editar Custo" : "Lançar Novo Custo"}
              </h3>

              {/* Budget item select */}
              <div className="space-y-1">
                <Label className="text-xs">Item do orçamento</Label>
                <Select value={budgetItemId || "_none"} onValueChange={v => {
                  const id = v === "_none" ? null : v;
                  setBudgetItemId(id);
                  if (id) {
                    const item = items.find(i => i.id === id);
                    if (item?.has_supplier_cost && !editingCost) {
                      setAmount(item.supplier_cost);
                    }
                  }
                }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum</SelectItem>
                    {items.map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.item_name} ({i.category})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedItem && (
                  <p className="text-xs text-muted-foreground">
                    Orçado: {formatCurrency(selectedItem.supplier_cost)} | Exec: {formatCurrency(executedForItem)} | Saldo: {formatCurrency(budgetedForItem - executedForItem)}
                  </p>
                )}
              </div>

              {/* Supplier with search dropdown */}
              <div className="space-y-1 relative">
                <Label className="text-xs">Fornecedor</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-9 text-sm"
                    placeholder="Buscar ou criar fornecedor..."
                    value={supplierSearch}
                    onChange={e => {
                      setSupplierSearch(e.target.value);
                      setSupplierName(e.target.value);
                      if (!supplierPopoverOpen) setSupplierPopoverOpen(true);
                    }}
                    onFocus={() => setSupplierPopoverOpen(true)}
                    onBlur={(e) => {
                      // delay to allow click on dropdown items
                      setTimeout(() => setSupplierPopoverOpen(false), 200);
                    }}
                  />
                </div>
                {supplierPopoverOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-[250px] overflow-y-auto">
                  
                    {genericContacts.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Genéricos</p>
                        {genericContacts.map(c => (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                            onClick={() => selectSupplier(c)}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {specificContacts.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Fornecedores</p>
                        {specificContacts.map(c => (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                            onClick={() => selectSupplier(c)}
                          >
                            <span>{c.name}</span>
                            {c.document && <span className="text-xs text-muted-foreground ml-2">{c.document}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      className="w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-muted transition-colors border-t border-border"
                      onClick={() => {
                        setSupplierPopoverOpen(false);
                        setNewName(supplierSearch);
                        setNewSupplierOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 inline mr-1" /> Criar novo fornecedor
                    </button>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Input className="h-9 text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Diária 4.5 dias" />
              </div>

              {/* Value + service date */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Valor R$</Label>
                  <Input className="h-9 text-sm" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} min={0} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data serviço</Label>
                  <Input className="h-9 text-sm" type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
                </div>
              </div>

              {/* Payment date + status */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Pagamento</Label>
                  <Input className="h-9 text-sm" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="overdue">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" checked={sentToContaAzul} onChange={e => setSentToContaAzul(e.target.checked)} className="rounded border-border" />
                <Label className="text-xs">Enviar para Conta Azul</Label>
              </div>

              {wouldExceed200 && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Valor ultrapassa 200% do orçado ({formatCurrency(budgetedForItem)}).
                </div>
              )}

              <div className="flex gap-2">
                {editingCost && (
                  <Button variant="ghost" size="sm" className="flex-1" onClick={resetForm}>Cancelar</Button>
                )}
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => saveCost.mutate()}
                  disabled={saveCost.isPending || !amount}
                >
                  {editingCost ? "Atualizar" : "Salvar Custo"}
                </Button>
              </div>
            </div>

            {/* RIGHT — cost list */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Custos Registrados</h3>
              {costs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum custo lançado ainda.</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {costs.map(cost => {
                    const relatedItem = cost.budget_item_id ? items.find(i => i.id === cost.budget_item_id) : null;
                    return (
                      <div
                        key={cost.id}
                        className="rounded-lg border border-border p-3 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => loadCostIntoForm(cost)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{cost.supplier_name || cost.supplier || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {relatedItem?.item_name || cost.category || "Diversos"}{cost.description ? ` · ${cost.description}` : ""}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(cost.amount)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {cost.service_date ? formatDate(cost.service_date) : "—"} → {cost.payment_date ? formatDate(cost.payment_date) : "—"}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{statusIcons[cost.status]} {statusLabels[cost.status]}</span>
                            {cost.sent_to_conta_azul && <Badge variant="secondary" className="text-[9px] h-4 px-1">CA</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 pt-0.5" onClick={e => e.stopPropagation()}>
                          {cost.status !== "paid" && (
                            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-[hsl(var(--success))]" onClick={() => markPaid.mutate(cost.id)}>
                              <CheckCircle className="h-3 w-3 mr-0.5" /> Pago
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-destructive" onClick={() => setDeleteId(cost.id)}>
                            <Trash2 className="h-3 w-3 mr-0.5" /> Excluir
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* New supplier dialog */}
      <Dialog open={newSupplierOpen} onOpenChange={setNewSupplierOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input className="h-9 text-sm" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Pessoa física</SelectItem>
                  <SelectItem value="company">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPF/CNPJ (opcional)</Label>
              <Input className="h-9 text-sm" value={newDoc} onChange={e => setNewDoc(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setNewSupplierOpen(false)}>Cancelar</Button>
              <Button size="sm" className="flex-1" onClick={handleCreateSupplier} disabled={!newName.trim() || createContact.isPending}>
                Salvar e usar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
