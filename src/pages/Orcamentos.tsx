import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBudgets, useBudgetWithItems, useDeleteBudget, useDuplicateBudget } from "@/hooks/useBudgets";
import { BudgetCard } from "@/components/budgets/BudgetCard";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import { CostManagement } from "@/components/budgets/CostManagement";
import { SupplierManagement } from "@/components/budgets/SupplierManagement";

export default function Orcamentos() {
  const { data: budgets = [], isLoading } = useBudgets();
  const deleteBudget = useDeleteBudget();
  const duplicateBudget = useDuplicateBudget();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [costBudgetId, setCostBudgetId] = useState<string | null>(null);

  const { data: costBudget } = useBudgetWithItems(costBudgetId);

  if (creating || editingId) {
    return (
      <BudgetForm
        budgetId={editingId}
        onClose={() => {
          setEditingId(null);
          setCreating(false);
        }}
        onOpenVersion={(id) => {
          setEditingId(id);
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
                      versionCount={b.version}
                      onShowVersions={() => setEditingId(b.id)}
                    />
                  ))}
                </div>
              )}

              {/* Cost Management + Supplier Management for approved budgets */}
              {status === "approved" && list.length > 0 && (
                <div className="mt-6 space-y-4">
                  <h2 className="font-heading text-lg font-semibold">Gestão de Custos & Fornecedores</h2>
                  <div className="flex gap-2 flex-wrap">
                    {list.map((b) => (
                      <Button
                        key={b.id}
                        variant={costBudgetId === b.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCostBudgetId(costBudgetId === b.id ? null : b.id)}
                      >
                        {b.budget_number ? `#${b.budget_number} ` : ""}{b.project_name}
                      </Button>
                    ))}
                  </div>
                  {costBudget && (
                    <div className="space-y-4">
                      <CostManagement budget={costBudget} items={costBudget.budget_items} />
                      <SupplierManagement budget={costBudget} items={costBudget.budget_items} />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
