import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBudgets, useDeleteBudget, useDuplicateBudget } from "@/hooks/useBudgets";
import { BudgetCard } from "@/components/budgets/BudgetCard";
import { BudgetForm } from "@/components/budgets/BudgetForm";

export default function Orcamentos() {
  const { data: budgets = [], isLoading } = useBudgets();
  const deleteBudget = useDeleteBudget();
  const duplicateBudget = useDuplicateBudget();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating || editingId) {
    return (
      <BudgetForm
        budgetId={editingId}
        onClose={() => {
          setEditingId(null);
          setCreating(false);
        }}
      />
    );
  }

  const drafts = budgets.filter((b) => b.status === "draft");
  const approved = budgets.filter((b) => b.status === "approved");
  const rejected = budgets.filter((b) => b.status === "rejected");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Orçamentos</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Orçamento
        </Button>
      </div>

      <Tabs defaultValue="draft">
        <TabsList>
          <TabsTrigger value="draft">Rascunhos ({drafts.length})</TabsTrigger>
          <TabsTrigger value="approved">Aprovados ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitados ({rejected.length})</TabsTrigger>
        </TabsList>

        {(["draft", "approved", "rejected"] as const).map((status) => {
          const list = status === "draft" ? drafts : status === "approved" ? approved : rejected;
          return (
            <TabsContent key={status} value={status}>
              {isLoading ? (
                <p className="text-muted-foreground py-8 text-center">Carregando...</p>
              ) : list.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">Nenhum orçamento encontrado.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {list.map((b) => (
                    <BudgetCard
                      key={b.id}
                      budget={b}
                      onEdit={() => setEditingId(b.id)}
                      onDuplicate={() => duplicateBudget.mutate(b.id)}
                      onDelete={() => deleteBudget.mutate(b.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
