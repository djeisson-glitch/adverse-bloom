import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useProjects, useCreateProject, useDeleteProject, useUpdateProject, useCreateProjectFromBudget, PRODUCTION_STAGES_NEW } from "@/hooks/useProjects";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientSelect } from "@/components/clientes/ClientSelect";
import { ProductionKanban, PRODUCTION_STAGES } from "@/components/producao/ProductionKanban";
import { Plus, Loader2, Trash2, DollarSign, Briefcase, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

const STATUSES = PRODUCTION_STAGES_NEW.map(s => s.id);

export default function Projetos() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const [open, setOpen] = useState(false);
  const [viewTab, setViewTab] = useState("kanban");
  const [invoiceModal, setInvoiceModal] = useState<string | null>(null);
  const [invoiceValue, setInvoiceValue] = useState("");

  const [form, setForm] = useState({
    name: "", client_name: "", client_id: "" as string | null, sold_value: "", direct_costs: "",
    status: "briefing", sold_date: "", delivery_date: "", notes: "",
  });

  // Header metrics
  const activeProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => p.status !== "faturado");
  }, [projects]);

  const receitaAberto = useMemo(() => {
    return activeProjects.reduce((s, p) => s + ((p as any).contract_value || p.sold_value || 0), 0);
  }, [activeProjects]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const receitaFaturadaMes = useMemo(() => {
    if (!projects) return 0;
    return projects
      .filter(p => {
        const bs = (p as any).billing_status;
        if (bs !== "invoiced" && bs !== "paid") return false;
        const updated = new Date(p.created_at);
        return updated >= monthStart;
      })
      .reduce((s, p) => s + ((p as any).invoiced_value || 0), 0);
  }, [projects, monthStart]);

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
      } as any);
      toast.success("Projeto criado com sucesso!");
      setOpen(false);
      setForm({ name: "", client_name: "", client_id: null, sold_value: "", direct_costs: "", status: "briefing", sold_date: "", delivery_date: "", notes: "" });
    } catch {
      toast.error("Erro ao criar projeto.");
    }
  };

  const handleMoveProject = (projectId: string, newStatus: string) => {
    if (newStatus === "faturado") {
      setInvoiceModal(projectId);
      setInvoiceValue("");
      return;
    }
    updateProject.mutate({ id: projectId, status: newStatus } as any);
  };

  const handleInvoiceConfirm = () => {
    if (!invoiceModal) return;
    const val = parseFloat(invoiceValue) || 0;
    updateProject.mutate({
      id: invoiceModal,
      status: "faturado",
      billing_status: "invoiced",
      invoiced_value: val,
    } as any);
    setInvoiceModal(null);
    toast.success("Projeto movido para Faturado");
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
                  <SelectContent>{STATUSES.map((s) => {
                    const stage = PRODUCTION_STAGES_NEW.find(st => st.id === s);
                    return <SelectItem key={s} value={s}>{stage?.label || s}</SelectItem>;
                  })}</SelectContent>
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projetos em andamento</p>
              <p className="text-xl font-heading font-bold">{activeProjects.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Receita em aberto</p>
              <p className="text-xl font-heading font-bold">{formatCurrency(receitaAberto)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Faturado no mês</p>
              <p className="text-xl font-heading font-bold">{formatCurrency(receitaFaturadaMes)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={viewTab} onValueChange={setViewTab}>
        <TabsList>
          <TabsTrigger value="kanban">Pipeline</TabsTrigger>
          <TabsTrigger value="tabela">Tabela</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <ProductionKanban
            projects={projects || []}
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
                    <th className="p-4 font-medium">Faturamento</th>
                    <th className="p-4 font-medium text-right">Valor Contrato</th>
                    <th className="p-4 font-medium text-right">Custos</th>
                    <th className="p-4 font-medium">Entrega</th>
                    <th className="p-4 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {(!projects || projects.length === 0) ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum projeto encontrado.</td></tr>
                  ) : (
                    projects.map((p) => {
                      const stage = PRODUCTION_STAGES_NEW.find(s => s.id === p.status);
                      const billing = (p as any).billing_status || "pending";
                      const billingLabels: Record<string, string> = { pending: "A faturar", partial: "Parcial", invoiced: "Faturado", paid: "Recebido" };
                      return (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                          <td className="p-4 font-medium">{p.name}</td>
                          <td className="p-4 text-muted-foreground">{p.client_name}</td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-xs">{stage?.label || p.status}</Badge>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-xs">{billingLabels[billing] || billing}</Badge>
                          </td>
                          <td className="p-4 text-right font-heading font-semibold text-primary">
                            {formatCurrency((p as any).contract_value || p.sold_value || 0)}
                          </td>
                          <td className="p-4 text-right text-muted-foreground">{formatCurrency(p.direct_costs ?? 0)}</td>
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Invoice Modal */}
      <Dialog open={!!invoiceModal} onOpenChange={(v) => { if (!v) setInvoiceModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar Faturamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Valor faturado (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={invoiceValue}
              onChange={(e) => setInvoiceValue(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceModal(null)}>Cancelar</Button>
            <Button onClick={handleInvoiceConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
