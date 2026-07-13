import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClients, useDeals } from "@/hooks/useDeals";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatPercent } from "@/lib/format";
import { ClientAvatar } from "@/components/clientes/ClientAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Save, DollarSign, Briefcase, TrendingUp, Target, Plus, Check, Clock, Calendar, Activity, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { STAGES } from "@/hooks/useDeals";
import IntakeConfig from "@/components/clientes/IntakeConfig";

const SEGMENTS = ["Tecnologia", "Saúde", "Educação", "Varejo", "Indústria", "Serviços", "Entretenimento", "Outro"];
const ORIGINS = ["Apollo", "Indicação", "Evento", "Outros"];

const stageLabels: Record<string, string> = {};
STAGES.forEach((s) => { stageLabels[s.id] = s.label; });

const stageBadge: Record<string, string> = {
  diagnostico: "bg-blue-500/20 text-blue-400",
  orcamento: "bg-amber-500/20 text-amber-400",
  proposta: "bg-purple-500/20 text-purple-400",
  fechamento: "bg-green-500/20 text-green-400",
  perdido: "bg-red-500/20 text-red-400",
};

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clients, updateClient } = useClients();
  const { deals } = useDeals();
  const { toast } = useToast();

  const client = clients.find((c) => c.id === id);

  // Budget data for this client
  const budgetsQuery = useQuery({
    queryKey: ["budgets-client", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("client_id", id)
        .eq("is_latest_version", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Projects for this client
  const projectsQuery = useQuery({
    queryKey: ["projects-client", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Tasks for this client's deals
  const clientDeals = useMemo(() => deals.filter((d) => d.client_id === id), [deals, id]);
  const dealIds = clientDeals.map((d) => d.id);

  const tasksQuery = useQuery({
    queryKey: ["tasks-client", id],
    queryFn: async () => {
      if (!dealIds.length) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .in("deal_id", dealIds)
        .order("completed", { ascending: true })
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: dealIds.length > 0,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  if (!client) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const startEdit = () => {
    const originMatch = client.notes?.match(/^Origem: (.+)$/m);
    setForm({
      name: client.name,
      company: client.company || "",
      email: client.email || "",
      phone: client.phone || "",
      segment: client.segment || "",
      origin: originMatch?.[1] || "",
      notes: client.notes?.replace(/^Origem: .+\n?/m, "").trim() || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const notes = form.origin ? `Origem: ${form.origin}\n${form.notes}`.trim() : form.notes.trim();
      await updateClient.mutateAsync({
        id: client.id,
        name: form.name.trim(),
        company: form.company.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        segment: form.segment || null,
        notes: notes || null,
      });
      toast({ title: "Cliente atualizado!" });
      setEditing(false);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  // Summary stats
  const wonDeals = clientDeals.filter((d) => d.stage === "fechamento");
  const lostDeals = clientDeals.filter((d) => d.stage === "perdido");
  const ltv = wonDeals.reduce((s, d) => s + (d.approved_value ?? d.value ?? 0), 0);
  const lostValue = lostDeals.reduce((s, d) => s + (d.approved_value ?? d.value ?? 0), 0);
  const budgets = budgetsQuery.data || [];
  const projects = projectsQuery.data || [];
  const tasks = tasksQuery.data || [];

  // Count projects from budgets' project_count
  const totalProjectCount = budgets
    .filter((b) => wonDeals.some((d) => d.id === (b as any).deal_id))
    .reduce((s, b) => s + ((b as any).project_count || 1), 0);
  const ticketMedio = totalProjectCount > 0 ? ltv / totalProjectCount : (wonDeals.length > 0 ? ltv / wonDeals.length : 0);
  const taxaConversao = clientDeals.length > 0 ? (wonDeals.length / clientDeals.length) * 100 : 0;

  const originMatch = client.notes?.match(/^Origem: (.+)$/m);
  const origin = originMatch?.[1] || "";
  const cleanNotes = client.notes?.replace(/^Origem: .+\n?/m, "").trim() || "";

  // Timeline
  const firstDealDate = clientDeals.length > 0
    ? clientDeals.reduce((min, d) => (!min || (d.created_at && d.created_at < min) ? d.created_at! : min), "")
    : null;
  const lastProjectDate = projects.length > 0 ? projects[0].created_at : null;
  const relationshipMonths = firstDealDate
    ? Math.max(1, Math.round((Date.now() - new Date(firstDealDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 0;

  // Cycle between projects
  const sortedProjectDates = projects
    .map((p) => new Date(p.created_at).getTime())
    .sort((a, b) => a - b);
  let avgCycleMonths = 0;
  if (sortedProjectDates.length >= 2) {
    const gaps = sortedProjectDates.slice(1).map((d, i) => d - sortedProjectDates[i]);
    avgCycleMonths = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length / (1000 * 60 * 60 * 24 * 30));
  }

  const summaryCards = [
    { label: "LTV Total", value: formatCurrency(ltv), icon: DollarSign, color: "text-primary" },
    { label: "Ticket Médio", value: formatCurrency(ticketMedio), icon: TrendingUp, color: "text-primary" },
    { label: "Valor Fechado", value: formatCurrency(ltv), icon: Target, color: "text-green-400" },
    { label: "Valor Perdido", value: formatCurrency(lostValue), icon: AlertTriangle, color: "text-red-400" },
    { label: "Projetos", value: String(totalProjectCount || projects.length), icon: Briefcase, color: "text-primary" },
    { label: "Conversão", value: formatPercent(taxaConversao), icon: Activity, color: taxaConversao >= 50 ? "text-green-400" : "text-amber-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <ClientAvatar name={client.name} className="h-12 w-12 text-base" />
        <div>
          <h1 className="font-heading text-2xl font-bold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">{client.company || "Sem empresa"}{client.segment ? ` · ${client.segment}` : ""}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {summaryCards.map((s) => (
          <Card key={s.label} className="bg-card border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-heading font-bold ${s.color}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Timeline card */}
      {firstDealDate && (
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Timeline de Relacionamento
            </h3>
            <div className="flex items-center gap-8 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Primeiro contato</p>
                <p className="font-medium">{new Date(firstDealDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
              </div>
              {lastProjectDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Último projeto</p>
                  <p className="font-medium">{new Date(lastProjectDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Tempo de relacionamento</p>
                <p className="font-medium">{relationshipMonths} {relationshipMonths === 1 ? "mês" : "meses"}</p>
              </div>
              {avgCycleMonths > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Ciclo médio entre projetos</p>
                  <p className="font-medium">{avgCycleMonths} {avgCycleMonths === 1 ? "mês" : "meses"}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Client info */}
        <Card className="bg-card border-border/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">Dados do Cliente</h2>
              {!editing && <Button variant="outline" size="sm" onClick={startEdit}>Editar</Button>}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Segmento</Label>
                  <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Origem</Label>
                  <Select value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Notas</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={updateClient.isPending} size="sm">
                    <Save className="mr-1 h-3.5 w-3.5" /> Salvar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <InfoRow label="Email" value={client.email} />
                <InfoRow label="Telefone" value={client.phone} />
                <InfoRow label="Segmento" value={client.segment} />
                <InfoRow label="Origem" value={origin} />
                {cleanNotes && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Notas</p>
                    <p className="text-foreground whitespace-pre-wrap">{cleanNotes}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: History tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="deals">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="deals">Deals ({clientDeals.length})</TabsTrigger>
              <TabsTrigger value="orcamentos">Orçamentos ({budgets.length})</TabsTrigger>
              <TabsTrigger value="tarefas">Tarefas ({tasks.length})</TabsTrigger>
              <TabsTrigger value="formulario">Formulário de demandas</TabsTrigger>
            </TabsList>

            <TabsContent value="deals" className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => navigate(`/comercial?client_id=${id}`)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Novo Deal
                </Button>
              </div>
              {clientDeals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum deal vinculado</p>
              ) : (
                <div className="space-y-2">
                  {clientDeals.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card hover:bg-secondary/30 transition-colors">
                      <div>
                        <p className="font-medium text-sm">{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.created_at ? new Date(d.created_at).toLocaleDateString("pt-BR") : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-heading font-semibold text-sm text-primary">{formatCurrency(d.approved_value ?? d.value ?? 0)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${stageBadge[d.stage] || "bg-secondary text-secondary-foreground"}`}>
                          {stageLabels[d.stage] || d.stage}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="orcamentos" className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => navigate(`/orcamentos?client=${encodeURIComponent(client.name)}`)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Novo Orçamento
                </Button>
              </div>
              {budgets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum orçamento vinculado</p>
              ) : (
                <div className="space-y-2">
                  {budgets.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card hover:bg-secondary/30 transition-colors">
                      <div>
                        <p className="font-medium text-sm">#{b.budget_number} — {b.project_name}</p>
                        <p className="text-xs text-muted-foreground">{b.client_name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-heading font-semibold text-sm text-primary">{formatCurrency(b.total_value || 0)}</span>
                        <span className="text-xs text-muted-foreground">{formatPercent(b.margin_percent || 0)} margem</span>
                        <Badge variant={b.status === "approved" ? "default" : "outline"} className="text-xs">
                          {b.status === "approved" ? "Aprovado" : "Rascunho"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tarefas" className="space-y-3">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma tarefa vinculada</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card ${t.completed ? "opacity-50" : ""}`}
                    >
                      {t.completed ? (
                        <Check className="h-4 w-4 text-green-400 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                      )}
                      <span className={`flex-1 text-sm ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                        {t.title}
                      </span>
                      {t.due_date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(t.due_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="formulario">
              {id && <IntakeConfig clientId={id} clientName={client.name} />}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground">{value || "—"}</p>
    </div>
  );
}
