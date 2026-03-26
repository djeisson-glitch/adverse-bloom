import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClients, useDeals } from "@/hooks/useDeals";
import { useTasks } from "@/hooks/useTasks";
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
import { Loader2, ArrowLeft, Save, DollarSign, Briefcase, TrendingUp, Target, Plus, Check, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SEGMENTS = ["Tecnologia", "Saúde", "Educação", "Varejo", "Indústria", "Serviços", "Entretenimento", "Outro"];
const ORIGINS = ["Apollo", "Indicação", "Evento", "Outros"];

const stageBadge: Record<string, string> = {
  contato: "bg-blue-500/20 text-blue-400",
  proposta: "bg-amber-500/20 text-amber-400",
  negociacao: "bg-purple-500/20 text-purple-400",
  ganho: "bg-green-500/20 text-green-400",
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
    queryKey: ["budgets-client", client?.name],
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("client_name", client.name)
        .eq("is_latest_version", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!client,
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
  const totalFaturado = wonDeals.reduce((s, d) => s + (d.value || 0), 0);
  const ticketMedio = wonDeals.length > 0 ? totalFaturado / wonDeals.length : 0;
  const taxaConversao = clientDeals.length > 0 ? (wonDeals.length / clientDeals.length) * 100 : 0;
  const budgets = budgetsQuery.data || [];
  const tasks = tasksQuery.data || [];
  const originMatch = client.notes?.match(/^Origem: (.+)$/m);
  const origin = originMatch?.[1] || "";
  const cleanNotes = client.notes?.replace(/^Origem: .+\n?/m, "").trim() || "";

  const summaryCards = [
    { label: "Total Faturado", value: formatCurrency(totalFaturado), icon: DollarSign, color: "text-primary" },
    { label: "Ticket Médio", value: formatCurrency(ticketMedio), icon: TrendingUp, color: "text-primary" },
    { label: "Projetos Ganhos", value: String(wonDeals.length), icon: Briefcase, color: "text-green-400" },
    { label: "Taxa de Conversão", value: formatPercent(taxaConversao), icon: Target, color: taxaConversao >= 50 ? "text-green-400" : "text-amber-400" },
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
      <div className="grid grid-cols-4 gap-4">
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
              <TabsTrigger value="projetos">Projetos</TabsTrigger>
              <TabsTrigger value="tarefas">Tarefas ({tasks.length})</TabsTrigger>
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
                        <span className="font-heading font-semibold text-sm text-primary">{formatCurrency(d.value || 0)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${stageBadge[d.stage] || "bg-secondary text-secondary-foreground"}`}>
                          {d.stage}
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

            <TabsContent value="projetos">
              <div className="py-10 text-center text-muted-foreground">
                <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Em breve</p>
              </div>
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
