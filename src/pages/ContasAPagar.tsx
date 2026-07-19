import { useState, useMemo } from "react";
import { Download, CheckCircle, FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAllSuppliers, useUpdateSupplierStatus, useMarkSentToContaAzul } from "@/hooks/useSuppliers";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
};

const statusIcons: Record<string, string> = {
  pending: "🟡",
  paid: "🟢",
  overdue: "🔴",
};

export default function ContasAPagar() {
  const { data: suppliers = [], isLoading } = useAllSuppliers();
  const updateStatus = useUpdateSupplierStatus();
  const markSent = useMarkSentToContaAzul();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const filtered = useMemo(() => {
    let list = suppliers;
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter);
    }
    return list;
  }, [suppliers, statusFilter]);

  const totalAPagar = filtered
    .filter((s) => s.status !== "paid")
    .reduce((sum, s) => sum + s.amount, 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleMarkPaid = () => {
    selectedIds.forEach((id) => updateStatus.mutate({ id, status: "paid" }));
    setSelectedIds([]);
  };

  // Export logic
  const exportableSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (s.sent_to_conta_azul) return false;
      if (exportFrom && s.payment_date && s.payment_date < exportFrom) return false;
      if (exportTo && s.payment_date && s.payment_date > exportTo) return false;
      return true;
    });
  }, [suppliers, exportFrom, exportTo]);

  const [exportSelected, setExportSelected] = useState<string[]>([]);

  const openExportModal = () => {
    setExportSelected(exportableSuppliers.map((s) => s.id));
    setExportOpen(true);
  };

  const handleExportCSV = () => {
    const toExport = exportableSuppliers.filter((s) => exportSelected.includes(s.id));
    if (toExport.length === 0) return;

    const header = "data_vencimento,descricao,fornecedor,valor,categoria,projeto";
    const rows = toExport.map((s) => {
      const date = s.payment_date ? formatDate(s.payment_date) : "";
      return `${date},${s.supplier_name},${s.supplier_name},${s.amount.toFixed(2)},,${s.budget_project_name ?? ""}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas_a_pagar_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Mark as sent
    markSent.mutate(toExport.map((s) => s.id));
    toast({ title: `${toExport.length} registros exportados!` });
    setExportOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-foreground">Contas a Pagar</h1>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.length > 0 && (
            <Button variant="secondary" size="sm" onClick={handleMarkPaid}>
              <CheckCircle className="h-4 w-4 mr-1" /> Pago ({selectedIds.length})
            </Button>
          )}
          <Button size="sm" onClick={openExportModal}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="overdue">Atrasado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhuma conta encontrada.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">CA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer">
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(s.id)}
                        onCheckedChange={() => toggleSelect(s.id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{s.budget_project_name}</TableCell>
                    <TableCell className="text-sm">{s.supplier_name}</TableCell>
                    <TableCell className="text-sm text-right font-semibold">{formatCurrency(s.amount)}</TableCell>
                    <TableCell className="text-sm">{formatDate(s.payment_date)}</TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {statusIcons[s.status] ?? ""} {statusLabels[s.status] ?? s.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {s.sent_to_conta_azul && <Badge variant="secondary" className="text-[10px]">CA</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Total */}
      <div className="flex justify-end">
        <Card className="w-auto">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Total a pagar:</span>
            <span className="text-lg font-bold text-[hsl(var(--warning))]">{formatCurrency(totalAPagar)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Export Modal */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Exportar para Conta Azul
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            <Separator />

            <div className="space-y-2 max-h-60 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">Itens selecionados:</p>
              {exportableSuppliers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum item disponível para exportação.</p>
              ) : (
                exportableSuppliers.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={exportSelected.includes(s.id)}
                      onCheckedChange={(c) => {
                        setExportSelected((prev) =>
                          c ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                        );
                      }}
                    />
                    <span className="flex-1">{s.budget_project_name} — {s.supplier_name}</span>
                    <span className="font-medium">{formatCurrency(s.amount)}</span>
                  </label>
                ))
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Total: {formatCurrency(exportableSuppliers.filter((s) => exportSelected.includes(s.id)).reduce((sum, s) => sum + s.amount, 0))}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setExportOpen(false)}>Cancelar</Button>
                <Button onClick={handleExportCSV} disabled={exportSelected.length === 0}>
                  <Download className="h-4 w-4 mr-1" /> Exportar CSV
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
