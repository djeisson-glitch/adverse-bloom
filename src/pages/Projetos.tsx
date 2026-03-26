import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useProjects, useCreateProject, useDeleteProject, useUpdateProject } from "@/hooks/useProjects";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientSelect } from "@/components/clientes/ClientSelect";
import { ProductionKanban, PRODUCTION_STAGES } from "@/components/producao/ProductionKanban";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES = PRODUCTION_STAGES.map(s => s.id);

const statusColor: Record<string, string> = {
  "Pré-produção": "bg-warning/20 text-warning border-warning/30",
  "Captação": "bg-primary/20 text-primary border-primary/30",
  "Pós-produção": "bg-accent/20 text-accent border-accent/30",
  "Aprovação do cliente": "bg-secondary text-foreground border-border",
  "Encerrado": "bg-success/20 text-success border-success/30",
};

export default function Projetos() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const [open, setOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [viewTab, setViewTab] = useState("kanban");

  const [form, setForm] = useState({
    name: "", client_name: "", client_id: "" as string | null, sold_value: "", direct_costs: "",
    status: "Pré-produção", sold_date: "", delivery_date: "", notes: "",
  });

  const filtered = useMemo(() => {
    if (!projects) return [];
    let list = projects;
    if (filterStatus !== "all") list = list.filter((p) => p.status === filterStatus);
    if (filterPeriod !== "all") {
      const now = new Date();
      const months = parseInt(filterPeriod);
      const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
      list = list.filter((p) => p.sold_date && new Date(p.sold_date) >= cutoff);
    }
    return list;
  }, [projects, filterStatus, filterPeriod]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProject.mutateAsync({
        name: form.name,
        client_name: form.client_name,
        client_id: form.client_id || undefined,
        sold_value: parseFloat(form.sold_value) || 0,
        direct_costs: parseFloat(form.direct_costs) || 0,
        status: form.status,
        sold_date: form.sold_date || null,
        delivery_date: form.delivery_date || null,
        notes: form.notes || null,
      });
      toast.success("Projeto criado com sucesso!");
      setOpen(false);
      setForm({ name: "", client_name: "", client_id: null, sold_value: "", direct_costs: "", status: "Pré-produção", sold_date: "", delivery_date: "", notes: "" });
    } catch {
      toast.error("Erro ao criar projeto.");
    }
  };

  const handleMoveProject = (projectId: string, newStatus: string) => {
    updateProject.mutate({ id: projectId, status: newStatus } as any);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Produção</h1>
          <p className="text-sm text-muted-foreground">Pipeline de produção dos projetos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Projeto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo Projeto</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <ClientSelect
                    value={form.client_id}
                    onChange={(id, name) => setForm({ ...form, client_id: id, client_name: name })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Vendido (R$)</Label>
                  <Input type="number" step="0.01" value={form.sold_value} onChange={(e) => setForm({ ...form, sold_value: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Custos Diretos (R$)</Label>
                  <Input type="number" step="0.01" value={form.direct_costs} onChange={(e) => setForm({ ...form, direct_costs: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Venda</Label>
                  <Input type="date" value={form.sold_date} onChange={(e) => setForm({ ...form, sold_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Entrega</Label>
                  <Input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={createProject.isPending}>
                {createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Projeto"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={viewTab} onValueChange={setViewTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="kanban">Pipeline</TabsTrigger>
            <TabsTrigger value="tabela">Tabela</TabsTrigger>
          </TabsList>
          <div className="flex gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="1">Último mês</SelectItem>
                <SelectItem value="3">Últimos 3 meses</SelectItem>
                <SelectItem value="6">Últimos 6 meses</SelectItem>
                <SelectItem value="12">Último ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="kanban" className="mt-4">
          <ProductionKanban
            projects={filtered}
            onMoveProject={handleMoveProject}
          />
        </TabsContent>

        <TabsContent value="tabela" className="mt-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-4 font-medium">Projeto</th>
                    <th className="p-4 font-medium">Cliente</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium text-right">Valor Vendido</th>
                    <th className="p-4 font-medium text-right">Custos</th>
                    <th className="p-4 font-medium text-right">Margem (R$)</th>
                    <th className="p-4 font-medium text-right">Margem (%)</th>
                    <th className="p-4 font-medium">Entrega</th>
                    <th className="p-4 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhum projeto encontrado.</td></tr>
                  ) : (
                    filtered.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="p-4 font-medium">{p.name}</td>
                        <td className="p-4 text-muted-foreground">{p.client_name}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[p.status] || ""}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-4 text-right font-heading font-semibold text-primary">{formatCurrency(p.sold_value ?? 0)}</td>
                        <td className="p-4 text-right text-muted-foreground">{formatCurrency(p.direct_costs ?? 0)}</td>
                        <td className={`p-4 text-right font-heading font-semibold ${(p.gross_margin_value ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(p.gross_margin_value ?? 0)}
                        </td>
                        <td className={`p-4 text-right ${(p.gross_margin_percent ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatPercent(p.gross_margin_percent ?? 0)}
                        </td>
                        <td className="p-4 text-muted-foreground">{formatDate(p.delivery_date)}</td>
                        <td className="p-4">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => {
                              if (confirm("Excluir este projeto?")) {
                                deleteProject.mutate(p.id, { onSuccess: () => toast.success("Projeto excluído.") });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
