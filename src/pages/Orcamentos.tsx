import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, Search, X, Download, MoreHorizontal, Edit, Copy, Trash2, History, ChevronUp, ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBudgets, useBudgetWithItems, useDeleteBudget, useDuplicateBudget } from "@/hooks/useBudgets";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import { CostManagement } from "@/components/budgets/CostManagement";
import { SupplierManagement } from "@/components/budgets/SupplierManagement";
import { VersionHistoryModal } from "@/components/budgets/VersionHistoryModal";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
// import { generateBudgetPDF } from "@/lib/generateBudgetPDF"; // PDF desativado temporariamente
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Budget, BudgetItem } from "@/hooks/useBudgets";

// ── Filter types ──────────────────────────────────────────
type SortField = "number" | "date" | "client" | "total" | "margin";
type SortDir = "asc" | "desc";
type PeriodPreset = "all" | "today" | "week" | "month" | "last_month" | "3months" | "6months" | "year" | "last_year";
type ValueRange = "all" | "0-5000" | "5001-10000" | "10001-20000" | "20001-50000" | "50001+";
type MarginRange = "all" | "critical" | "low" | "good" | "excellent";
type StatusFilter = "all" | "draft" | "approved" | "rejected" | "with_bv" | "no_bv";

const STORAGE_KEY = "adverse_budget_filters";

interface Filters {
  search: string;
  period: PeriodPreset;
  value: ValueRange;
  margin: MarginRange;
  status: StatusFilter;
  sort: SortField;
  sortDir: SortDir;
  tab: string;
}

const defaultFilters: Filters = {
  search: "",
  period: "all",
  value: "all",
  margin: "all",
  status: "all",
  sort: "date",
  sortDir: "desc",
  tab: "draft",
};

function loadFilters(): Filters {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...defaultFilters, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return defaultFilters;
}

function getPeriodRange(preset: PeriodPreset): { from: Date; to: Date } | null {
  if (preset === "all") return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(today);
  to.setHours(23, 59, 59, 999);

  switch (preset) {
    case "today": return { from: today, to };
    case "week": { const d = new Date(today); d.setDate(d.getDate() - d.getDay()); return { from: d, to }; }
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: f, to: t };
    }
    case "3months": { const d = new Date(today); d.setMonth(d.getMonth() - 3); return { from: d, to }; }
    case "6months": { const d = new Date(today); d.setMonth(d.getMonth() - 6); return { from: d, to }; }
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to };
    case "last_year": return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) };
    default: return null;
  }
}

function matchesValueRange(total: number, range: ValueRange): boolean {
  switch (range) {
    case "all": return true;
    case "0-5000": return total <= 5000;
    case "5001-10000": return total > 5000 && total <= 10000;
    case "10001-20000": return total > 10000 && total <= 20000;
    case "20001-50000": return total > 20000 && total <= 50000;
    case "50001+": return total > 50000;
    default: return true;
  }
}

function matchesMarginRange(margin: number, range: MarginRange): boolean {
  switch (range) {
    case "all": return true;
    case "critical": return margin < 15;
    case "low": return margin >= 15 && margin < 35;
    case "good": return margin >= 35 && margin < 50;
    case "excellent": return margin >= 50;
    default: return true;
  }
}

function getMarginColor(margin: number): string {
  if (margin >= 50) return "text-[hsl(var(--success))]";
  if (margin >= 35) return "text-[hsl(var(--warning))]";
  if (margin >= 15) return "text-orange-400";
  return "text-destructive";
}

const statusLabels: Record<string, string> = { draft: "Rascunho", approved: "Aprovado", rejected: "Rejeitado" };
const statusVariants: Record<string, "default" | "secondary" | "destructive"> = { draft: "secondary", approved: "default", rejected: "destructive" };

export default function Orcamentos() {
  const { data: budgets = [], isLoading } = useBudgets();
  const deleteBudget = useDeleteBudget();
  const duplicateBudget = useDuplicateBudget();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [costBudgetId, setCostBudgetId] = useState<string | null>(null);
  const [versionBudget, setVersionBudget] = useState<Budget | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: costBudget } = useBudgetWithItems(costBudgetId);

  // Persist filters
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.period !== "all") count++;
    if (filters.value !== "all") count++;
    if (filters.margin !== "all") count++;
    if (filters.status !== "all") count++;
    return count;
  }, [filters]);

  const clearFilters = useCallback(() => {
    setFilters(prev => ({ ...defaultFilters, tab: prev.tab, sort: prev.sort, sortDir: prev.sortDir }));
  }, []);

  // Filter + sort budgets
  const { filtered, tabCounts } = useMemo(() => {
    const searchLower = filters.search.toLowerCase();
    const periodRange = getPeriodRange(filters.period);

    // Count per tab before filtering by tab
    const counts = { draft: 0, approved: 0, rejected: 0 };

    const allFiltered = budgets.filter(b => {
      // Search
      if (searchLower) {
        const num = b.budget_number ? `#${b.budget_number}` : "";
        const haystack = `${num} ${b.project_name} ${b.client_name}`.toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      // Period
      if (periodRange) {
        const d = new Date(b.created_at);
        if (d < periodRange.from || d > periodRange.to) return false;
      }
      // Value
      if (!matchesValueRange(b.total_value ?? 0, filters.value)) return false;
      // Margin
      if (!matchesMarginRange(b.margin_percent ?? 0, filters.margin)) return false;
      // Status filter (extra)
      if (filters.status !== "all") {
        if (filters.status === "with_bv" && (b.bv_percent ?? 0) <= 0) return false;
        if (filters.status === "no_bv" && (b.bv_percent ?? 0) > 0) return false;
        if (["draft", "approved", "rejected"].includes(filters.status) && b.status !== filters.status) return false;
      }
      return true;
    });

    allFiltered.forEach(b => {
      if (b.status === "draft") counts.draft++;
      else if (b.status === "approved") counts.approved++;
      else if (b.status === "rejected") counts.rejected++;
    });

    // Tab filter
    const tabFiltered = allFiltered.filter(b => b.status === filters.tab);

    // Sort
    tabFiltered.sort((a, b) => {
      let cmp = 0;
      switch (filters.sort) {
        case "number": cmp = (a.budget_number ?? 0) - (b.budget_number ?? 0); break;
        case "date": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case "client": cmp = a.client_name.localeCompare(b.client_name); break;
        case "total": cmp = (a.total_value ?? 0) - (b.total_value ?? 0); break;
        case "margin": cmp = (a.margin_percent ?? 0) - (b.margin_percent ?? 0); break;
      }
      return filters.sortDir === "asc" ? cmp : -cmp;
    });

    return { filtered: tabFiltered, tabCounts: counts };
  }, [budgets, filters]);

  const totalAll = useMemo(() => {
    const counts = { draft: 0, approved: 0, rejected: 0 };
    budgets.forEach(b => {
      if (b.status === "draft") counts.draft++;
      else if (b.status === "approved") counts.approved++;
      else if (b.status === "rejected") counts.rejected++;
    });
    return counts;
  }, [budgets]);

  const toggleSort = useCallback((field: SortField) => {
    setFilters(prev => ({
      ...prev,
      sort: field,
      sortDir: prev.sort === field ? (prev.sortDir === "asc" ? "desc" : "asc") : "desc",
    }));
  }, []);

  // PDF desativado temporariamente
  // const handlePDF = async (budget: Budget) => {
  //   try {
  //     const { data: items, error } = await supabase
  //       .from("budget_items")
  //       .select("*")
  //       .eq("budget_id", budget.id)
  //       .order("order_index", { ascending: true });
  //     if (error) throw error;
  //     generateBudgetPDF(budget, (items || []) as BudgetItem[]);
  //   } catch (err: any) {
  //     console.error("PDF generation error:", err);
  //     toast({ title: "Erro ao gerar PDF", description: err?.message || "Erro desconhecido", variant: "destructive" });
  //   }
  // };

  const exportCSV = useCallback(() => {
    const headers = ["Número", "Versão", "Projeto", "Cliente", "Status", "Total", "Margem %", "Data"];
    const rows = filtered.map(b => [
      b.budget_number ?? "",
      `v${b.version}`,
      b.project_name,
      b.client_name,
      statusLabels[b.status] ?? b.status,
      b.total_value ?? 0,
      (b.margin_percent ?? 0).toFixed(1),
      formatDate(b.created_at),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orcamentos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  // ── Form mode ──
  if (creating || editingId) {
    return (
      <BudgetForm
        budgetId={editingId}
        onClose={() => { setEditingId(null); setCreating(false); }}
        onOpenVersion={(id) => setEditingId(id)}
      />
    );
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (filters.sort !== field) return null;
    return filters.sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1 inline" /> : <ChevronDown className="h-3 w-3 ml-1 inline" />;
  };

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center">{children}<SortIcon field={field} /></span>
    </TableHead>
  );

  // ── Filter bar ──
  const filterBar = (
    <div className="space-y-3">
      {/* Search + actions row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar projeto, cliente, #número..."
            value={filters.search}
            onChange={e => updateFilter("search", e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {activeFilterCount > 0 && (
            <Badge variant="default" className="h-5 px-1.5 text-xs ml-1">{activeFilterCount}</Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground gap-1">
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      {/* Collapsible filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <div className="flex flex-wrap gap-2 pt-1">
            <Select value={filters.period} onValueChange={v => updateFilter("period", v as PeriodPreset)}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="last_month">Último mês</SelectItem>
                <SelectItem value="3months">Últimos 3 meses</SelectItem>
                <SelectItem value="6months">Últimos 6 meses</SelectItem>
                <SelectItem value="year">Este ano</SelectItem>
                <SelectItem value="last_year">Ano passado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.value} onValueChange={v => updateFilter("value", v as ValueRange)}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Valor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os valores</SelectItem>
                <SelectItem value="0-5000">Até R$ 5.000</SelectItem>
                <SelectItem value="5001-10000">R$ 5.001 - R$ 10.000</SelectItem>
                <SelectItem value="10001-20000">R$ 10.001 - R$ 20.000</SelectItem>
                <SelectItem value="20001-50000">R$ 20.001 - R$ 50.000</SelectItem>
                <SelectItem value="50001+">Acima de R$ 50.000</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.margin} onValueChange={v => updateFilter("margin", v as MarginRange)}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Margem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as margens</SelectItem>
                <SelectItem value="critical">Crítica (&lt;15%)</SelectItem>
                <SelectItem value="low">Baixa (15-34%)</SelectItem>
                <SelectItem value="good">Boa (35-49%)</SelectItem>
                <SelectItem value="excellent">Excelente (≥50%)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={v => updateFilter("status", v as StatusFilter)}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="draft">Rascunhos</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
                <SelectItem value="with_bv">Com BV</SelectItem>
                <SelectItem value="no_bv">Sem BV</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  // ── Mobile card view ──
  const mobileCards = (
    <div className="space-y-2">
      {filtered.map(b => (
        <div key={b.id} className="bg-card rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {b.budget_number ? `#${b.budget_number} v${b.version}` : ""} {b.project_name}
              </p>
              <p className="text-xs text-muted-foreground">{b.client_name}</p>
            </div>
            <Badge variant={statusVariants[b.status]}>{statusLabels[b.status]}</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{formatCurrency(b.total_value ?? 0)}</span>
            <span className={getMarginColor(b.margin_percent ?? 0)}>{formatPercent(b.margin_percent ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{formatDate(b.created_at)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditingId(b.id)}><Edit className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicateBudget.mutate(b.id)}><Copy className="h-3.5 w-3.5 mr-2" />Duplicar</DropdownMenuItem>
                {/* PDF desativado temporariamente */}
                {b.version > 1 && <DropdownMenuItem onClick={() => setVersionBudget(b)}><History className="h-3.5 w-3.5 mr-2" />{b.version} versões</DropdownMenuItem>}
                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(b.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );

  // ── Desktop table view ──
  const desktopTable = (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card hover:bg-card">
            <SortableHead field="number" className="w-[100px]">Número</SortableHead>
            <SortableHead field="date">Projeto</SortableHead>
            <SortableHead field="client">Cliente</SortableHead>
            <SortableHead field="total" className="text-right">Total</SortableHead>
            <SortableHead field="margin" className="text-right">Margem</SortableHead>
            <TableHead className="w-[60px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Nenhum orçamento encontrado.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map(b => (
              <TableRow
                key={b.id}
                className="cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => setEditingId(b.id)}
              >
                <TableCell className="font-mono text-sm">
                  <button
                    onClick={(e) => { e.stopPropagation(); if (b.version > 1) setVersionBudget(b); }}
                    className={`${b.version > 1 ? "hover:text-primary underline-offset-2 hover:underline" : ""}`}
                  >
                    #{b.budget_number} v{b.version}
                  </button>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium text-foreground">{b.project_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(b.created_at)}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{b.client_name}</TableCell>
                <TableCell className="text-right font-semibold text-sm">{formatCurrency(b.total_value ?? 0)}</TableCell>
                <TableCell className={`text-right font-semibold text-sm ${getMarginColor(b.margin_percent ?? 0)}`}>
                  {formatPercent(b.margin_percent ?? 0)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingId(b.id)}><Edit className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicateBudget.mutate(b.id)}><Copy className="h-3.5 w-3.5 mr-2" />Duplicar</DropdownMenuItem>
                      {/* PDF desativado temporariamente */}
                      {b.version > 1 && <DropdownMenuItem onClick={() => setVersionBudget(b)}><History className="h-3.5 w-3.5 mr-2" />{b.version} versões</DropdownMenuItem>}
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(b.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Orçamentos</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Orçamento
        </Button>
      </div>

      {/* Filters */}
      {filterBar}

      {/* Tabs */}
      <Tabs
        value={filters.tab}
        onValueChange={v => updateFilter("tab", v)}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="draft">Rascunhos ({tabCounts.draft})</TabsTrigger>
            <TabsTrigger value="approved">Aprovados ({tabCounts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejeitados ({tabCounts.rejected})</TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">
            Exibindo {filtered.length} de {totalAll.draft + totalAll.approved + totalAll.rejected} orçamentos
          </span>
        </div>

        {(["draft", "approved", "rejected"] as const).map(status => (
          <TabsContent key={status} value={status}>
            {isLoading ? (
              <p className="text-muted-foreground py-8 text-center">Carregando...</p>
            ) : isMobile ? mobileCards : desktopTable}

            {/* Cost Management for approved */}
            {status === "approved" && filtered.length > 0 && (
              <div className="mt-6 space-y-4">
                <h2 className="font-heading text-lg font-semibold">Gestão de Custos & Fornecedores</h2>
                <div className="flex gap-2 flex-wrap">
                  {filtered.map(b => (
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
        ))}
      </Tabs>

      {/* Version History Modal */}
      {versionBudget && (
        <VersionHistoryModal
          budgetNumber={versionBudget.budget_number!}
          currentVersionId={versionBudget.id}
          onOpenVersion={(id) => { setVersionBudget(null); setEditingId(id); }}
          onClose={() => setVersionBudget(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O orçamento e todos os seus itens serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) { deleteBudget.mutate(deleteId); setDeleteId(null); } }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
