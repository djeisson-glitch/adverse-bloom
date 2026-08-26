import { useState, useMemo } from "react";
import { useVoltar } from "@/hooks/useVoltar";
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
import { Loader2, ArrowLeft, DollarSign, Briefcase, TrendingUp, Target, Plus, Check, Clock, Calendar, Activity, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useFormAutosave, vaziosParaNull } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { STAGES } from "@/hooks/useDeals";
import IntakeConfig from "@/components/clientes/IntakeConfig";
import FaturamentoConfig from "@/components/clientes/FaturamentoConfig";
import SaldoCliente from "@/components/clientes/SaldoCliente";
import { usePermissions } from "@/hooks/usePermissions";

const SEGMENTS = ["Tecnologia", "Saúde", "Educação", "Varejo", "Indústria", "Serviços", "Entretenimento", "Outro"];
const ORIGINS = ["Apollo", "Indicação", "Evento", "Outros"];

const stageLabels: Record<string, string> = {};
STAGES.forEach((s) => { stageLabels[s.id] = s.label; });

const stageBadge: Record<string, string> = {
  diagnostico: "bg-blue-500/20 text-info",
  orcamento: "bg-amber-500/20 text-warning",
  proposta: "bg-purple-500/20 text-roxo",
  fechamento: "bg-green-500/20 text-success",
  perdido: "bg-red-500/20 text-destructive",
};

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const voltar = useVoltar("/clientes");
  const { clients, updateClient } = useClients();
  const { deals } = useDeals();
  const { canSeeMoney } = usePermissions();

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

  // Re-hidrata só quando muda o CLIENTE. A tela atualiza sozinha a cada 30s e,
  // se seguisse a query, o refetch apagaria o que a pessoa está digitando.
  const [form, setForm] = useState<Record<string, string> | null>(null);
  if (client && form?.__id !== client.id) {
    setForm({
      __id: client.id,
      name: client.name,
      company: client.company || "",
      contact_name: client.contact_name || "",
      email: client.email || "",
      phone: client.phone || "",
      segment: client.segment || "",
      origin: client.notes?.match(/^Origem: (.+)$/m)?.[1] || "",
      notes: client.notes?.replace(/^Origem: .+\n?/m, "").trim() || "",
    });
  }

  // Salva ao digitar: manda só o campo mexido, ~0,8s depois da última tecla.
  const auto = useFormAutosave<Record<string, string | null>>(async (patch) => {
    try {
      await updateClient.mutateAsync({ id: id!, ...patch });
    } catch (e: any) {
      toast.error("Não salvou o cliente", { description: e?.message });
      throw e;
    }
  });

  if (!client || !form) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // Origem mora dentro de `notes` (linha "Origem: X"), então mexer em qualquer
  // um dos dois regrava a coluna inteira.
  const notesCom = (origem: string, notas: string) =>
    (origem ? `Origem: ${origem}\n${notas}` : notas).trim() || null;

  const set = (campo: string, valor: string) => {
    const novo = { ...form, [campo]: valor };
    setForm(novo);
    if (campo === "origin" || campo === "notes") {
      auto.agendar({ notes: notesCom(novo.origin, novo.notes) });
    } else {
      // Campo apagado vira NULL no banco — menos o nome, que é obrigatório.
      auto.agendar(vaziosParaNull({ [campo]: valor.trim() }, ["name"]));
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
    { label: "Valor Fechado", value: formatCurrency(ltv), icon: Target, color: "text-success" },
    { label: "Valor Perdido", value: formatCurrency(lostValue), icon: AlertTriangle, color: "text-destructive" },
    { label: "Projetos", value: String(totalProjectCount || projects.length), icon: Briefcase, color: "text-primary" },
    { label: "Conversão", value: formatPercent(taxaConversao), icon: Activity, color: taxaConversao >= 50 ? "text-success" : "text-warning" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={voltar}>
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
              <IndicadorAutosave status={auto.status} />
            </div>

            <div className="space-y-3">
              {/* Os três campos de nome viviam se confundindo: sem um lugar
                  pra PESSOA, ela acabava digitada em "Nome" — e aí o cliente
                  passava a se chamar Emmerson em vez de A Raiz da Solução no
                  sistema inteiro. Cada um agora diz para que serve. */}
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  Razão social ou como o cliente é conhecido. Aparece assim em todo o sistema e nas propostas.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => set("contact_name", e.target.value)}
                  placeholder="Quem assina e aprova"
                />
                <p className="text-[11px] text-muted-foreground">
                  A pessoa de contato. Sai como “A/C” na carta que vai pro cliente.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  Só quando a razão social ou o grupo for diferente do nome acima.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select value={form.segment} onValueChange={(v) => set("segment", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={form.origin} onValueChange={(v) => set("origin", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={4} />
              </div>
            </div>
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
              {canSeeMoney && <TabsTrigger value="faturamento">Faturamento</TabsTrigger>}
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
                        <Check className="h-4 w-4 text-success shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-warning shrink-0" />
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

            {canSeeMoney && (
              <TabsContent value="faturamento" className="space-y-4">
                {/* Saldo primeiro: antes de decidir como cobrar o mês, ver o
                    que o cliente já tem a usar. */}
                {id && <SaldoCliente clientId={id} />}
                {id && <FaturamentoConfig clientId={id} clientName={client.name} />}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
