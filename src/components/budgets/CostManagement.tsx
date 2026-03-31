import { useState } from "react";
import { Plus, DollarSign } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  payment_date: string | null;
  sent_to_conta_azul: boolean;
  created_at: string;
}

interface Props {
  budget: Budget;
  items: BudgetItem[];
}

export function CostManagement({ budget, items }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Form state
  const [category, setCategory] = useState("");
  const [budgetItemId, setBudgetItemId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
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

  const addCost = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_costs").insert({
        budget_id: budget.id,
        budget_item_id: budgetItemId,
        category,
        description,
        amount,
        supplier: supplier || null,
        payment_date: paymentDate || null,
        sent_to_conta_azul: sentToContaAzul,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_costs", budget.id] });
      toast({ title: "Custo lançado!" });
      resetForm();
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao lançar custo", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setCategory("");
    setBudgetItemId(null);
    setDescription("");
    setAmount(0);
    setSupplier("");
    setPaymentDate("");
    setSentToContaAzul(false);
  };

  const totalExecutado = costs.reduce((s, c) => s + c.amount, 0);
  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Gestão de Custos
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" /> Lançar Custo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Lançar Custo Real</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Item relacionado (opcional)</Label>
                  <Select value={budgetItemId || ""} onValueChange={(v) => setBudgetItemId(v || null)}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {items.filter((i) => i.category === category).map((i) => (
                        <SelectItem key={i.id} value={i.id || ""}>{i.item_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Valor R$</Label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} min={0} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fornecedor</Label>
                    <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Data pagamento</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                
                <Button className="w-full" onClick={() => addCost.mutate()} disabled={addCost.isPending || !category || !amount}>
                  Salvar
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
            <p className="text-xs text-muted-foreground">Orçado</p>
            <p className="font-semibold text-primary">{formatCurrency(budget.total_value)}</p>
          </div>
          <div className={`rounded-lg p-3 ${totalExecutado > budget.total_value ? "bg-destructive/10" : "bg-[hsl(var(--success))]/10"}`}>
            <p className="text-xs text-muted-foreground">Executado</p>
            <p className={`font-semibold ${totalExecutado > budget.total_value ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
              {formatCurrency(totalExecutado)}
            </p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className={`font-semibold ${budget.total_value - totalExecutado >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {formatCurrency(budget.total_value - totalExecutado)}
            </p>
          </div>
        </div>

        {/* Cost list */}
        {costs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum custo lançado.</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {costs.map((cost) => (
              <div key={cost.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium">{cost.description || cost.category}</p>
                  <p className="text-xs text-muted-foreground">
                    {cost.supplier && `${cost.supplier} · `}
                    {cost.payment_date ? formatDate(cost.payment_date) : "Sem data"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[hsl(var(--warning))]">{formatCurrency(cost.amount)}</span>
                  {cost.sent_to_conta_azul && <Badge variant="secondary" className="text-[10px]">CA</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
