import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { Edit, FileText, Eye, RotateCcw, CheckCircle, Clock, Link as LinkIcon, Send } from "lucide-react";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { BudgetWithItems } from "@/hooks/useBudgets";
import { GenerateProposalModal } from "./GenerateProposalModal";
import { useProposalLetters } from "@/hooks/useProposalLetters";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  budget: BudgetWithItems;
  onEdit: () => void;
  onRevertToDraft?: () => void;
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

function formatDateTime(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ProposalStatusTimeline({ letter }: { letter: any }) {
  const steps = [
    { label: "Link gerado", date: letter.created_at, icon: LinkIcon, done: true },
    { label: "Visualizada", date: letter.viewed_at, icon: Eye, done: !!letter.viewed_at },
    { label: "Aprovada", date: letter.approved_at, icon: CheckCircle, done: letter.status === "approved" },
  ];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <div className={`w-6 h-px ${step.done ? "bg-[hsl(var(--success))]" : "bg-border"}`} />}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${step.done ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "bg-muted text-muted-foreground"}`}>
            <step.icon className="h-3 w-3" />
            <span>{step.label}</span>
            {step.done && step.date && (
              <span className="text-[10px] opacity-70">{formatDateTime(step.date)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BudgetViewTab({ budget, onEdit, onRevertToDraft }: Props) {
  const [proposalOpen, setProposalOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const { data: proposalLetters } = useProposalLetters(budget.id);
  const { toast } = useToast();
  const qc = useQueryClient();

  const latestLetter = proposalLetters?.[0];

  const proposalStatus = useMemo(() => {
    if (!latestLetter) return { label: "Não enviada", variant: "secondary" as const };
    if (latestLetter.status === "approved") return { label: "Aprovada", variant: "default" as const };
    if (latestLetter.viewed_at) return { label: "Visualizada", variant: "secondary" as const };
    return { label: "Link gerado", variant: "secondary" as const };
  }, [latestLetter]);

  const categories = useMemo(() => {
    const cats = [...new Set(budget.budget_items.map(i => i.category))];
    return cats.map(cat => ({
      name: cat,
      items: budget.budget_items.filter(i => i.category === cat),
    }));
  }, [budget.budget_items]);

  const handleRevertToDraft = async () => {
    try {
      const { error } = await supabase
        .from("budgets")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", budget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["budget", budget.id] });
      toast({ title: "Orçamento movido para rascunho" });
      setRevertDialogOpen(false);
      if (onRevertToDraft) onRevertToDraft();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handlePreview = () => {
    // Build preview URL with budget data inline (no saving)
    const previewData = {
      budget,
      items: budget.budget_items,
      contactName: latestLetter?.contact_name || budget.client_name,
      contactCompany: latestLetter?.contact_company || budget.client_name,
      projectDescription: latestLetter?.project_description || "",
      tags: latestLetter?.tags || [],
      deliverables: latestLetter?.deliverables || [],
      paymentConditions: latestLetter?.payment_conditions || "À vista — 30 dias após aprovação",
      validityDays: latestLetter?.validity_days ?? 15,
    };
    // Store in sessionStorage and open preview
    sessionStorage.setItem("proposal_preview", JSON.stringify(previewData));
    window.open("/proposta/preview", "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Approval info banner */}
      {latestLetter?.status === "approved" && (
        <Card className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-[hsl(var(--success))] mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Proposta aprovada pelo cliente
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    <span className="text-foreground/70">Nome:</span>{" "}
                    <span className="font-medium text-foreground">{latestLetter.approved_name}</span>
                  </div>
                  <div>
                    <span className="text-foreground/70">E-mail:</span>{" "}
                    <span className="font-medium text-foreground">{latestLetter.approved_email}</span>
                  </div>
                  <div>
                    <span className="text-foreground/70">Data/Hora:</span>{" "}
                    <span className="font-medium text-foreground">{formatDateTime(latestLetter.approved_at)}</span>
                  </div>
                  <div>
                    <span className="text-foreground/70">IP:</span>{" "}
                    <span className="font-medium text-foreground">{latestLetter.approved_ip || "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proposal status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Status da Proposta</CardTitle>
            <Badge variant={proposalStatus.variant}>{proposalStatus.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {latestLetter ? (
            <ProposalStatusTimeline letter={latestLetter} />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma proposta gerada para este orçamento.</p>
          )}
        </CardContent>
      </Card>

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
      <div className="sticky bottom-0 z-10 flex items-center gap-3 flex-wrap bg-background border-t border-border pt-3 pb-3 -mx-1 px-1">
        <Button variant="outline" onClick={onEdit}>
          <Edit className="mr-2 h-4 w-4" /> Editar Orçamento
        </Button>
        <Button variant="outline" onClick={handlePreview}>
          <Eye className="mr-2 h-4 w-4" /> Pré-visualizar
        </Button>
        <Button onClick={() => setProposalOpen(true)}>
          <FileText className="mr-2 h-4 w-4" /> Gerar Proposta
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRevertDialogOpen(true)} className="text-muted-foreground">
          <RotateCcw className="mr-2 h-4 w-4" /> Voltar para rascunho
        </Button>
      </div>

      {/* Revert dialog */}
      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar para rascunho?</AlertDialogTitle>
            <AlertDialogDescription>
              O orçamento será movido de volta para "Em orçamentação". Links de proposta já enviados continuarão válidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevertToDraft}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
