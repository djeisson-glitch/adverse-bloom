import { useState, useMemo } from "react";
import { hojeISO } from "@/lib/dataLocal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ui/confirm";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { FileText, CheckCircle2, Clock, Wallet, AlertCircle, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

type Invoice = {
  id: string;
  numero: string | null;
  client_id: string | null;
  project_id: string | null;
  valor: number;
  status: string;
  data_emissao: string;
  data_pagamento: string | null;
  descricao: string | null;
  client?: { name: string } | null;
  project?: { name: string } | null;
};

export default function Faturamento() {
  const qc = useQueryClient();
  const confirmar = useConfirm();
  const { user } = useAuth();
  const { canSeeMoney } = usePermissions();

  const [form, setForm] = useState({
    client_id: "",
    project_id: "",
    valor: "",
    data_emissao: hojeISO(),
    descricao: "",
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("*, client:clients(name), project:projects(name)")
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["invoices-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["invoices-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects_v")
        .select("id, name, client_id, sold_value, client_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const kpis = useMemo(() => {
    const pago = invoices.filter((i) => i.status === "paga").reduce((s, i) => s + Number(i.valor || 0), 0);
    const receber = invoices.filter((i) => i.status === "enviada").reduce((s, i) => s + Number(i.valor || 0), 0);
    const rascunhos = invoices.filter((i) => i.status === "rascunho").reduce((s, i) => s + Number(i.valor || 0), 0);
    // Falta faturar = projetos com status faturado mas sem invoice associada
    const projetosFechados = projects.filter((p) => p.status === "faturado");
    const jaFaturado = new Set(invoices.map((i) => i.project_id));
    const falta = projetosFechados
      .filter((p) => !jaFaturado.has(p.id))
      .reduce((s, p) => s + Number(p.sold_value || 0), 0);
    return { pago, receber, rascunhos, falta };
  }, [invoices, projects]);

  const emitir = useMutation({
    mutationFn: async () => {
      if (!form.client_id) throw new Error("Escolha um cliente");
      if (!form.valor) throw new Error("Informe o valor");
      const { error } = await (supabase as any).from("invoices").insert({
        client_id: form.client_id,
        project_id: form.project_id || null,
        valor: Number(form.valor),
        data_emissao: form.data_emissao,
        descricao: form.descricao || null,
        status: "rascunho",
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ ...form, valor: "", descricao: "" });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Fatura emitida como rascunho");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from("invoices")
        .update({ status, data_pagamento: status === "paga" ? hojeISO() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      if (status === "paga") {
        toast.success("Fatura marcada como paga — snapshot enviado pro Conta Azul");
      }
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Só admin e produtor têm acesso ao Faturamento.
      </div>
    );
  }

  const filteredProjects = form.client_id ? projects.filter((p) => p.client_id === form.client_id) : projects;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Faturamento</h1>
          <p className="text-sm text-muted-foreground">
            Emita faturas/recibos por projeto ou cliente, acompanhe o recebimento e veja o que falta faturar.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi icon={CheckCircle2} label="Pago" value={formatCurrency(kpis.pago)} hint="—" tone="success" />
        <Kpi icon={Clock} label="A receber" value={formatCurrency(kpis.receber)} hint="enviadas não pagas" tone="primary" />
        <Kpi icon={Wallet} label="Rascunhos" value={formatCurrency(kpis.rascunhos)} hint="ainda não enviadas" tone="warning" />
        <Kpi icon={AlertCircle} label="Falta faturar" value={formatCurrency(kpis.falta)} hint="projetos já fechados" tone="destructive" />
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Emitir fatura</p>
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v, project_id: "" })}>
              <SelectTrigger>
                <SelectValue placeholder="Cliente…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Projeto (opcional)…" />
              </SelectTrigger>
              <SelectContent>
                {filteredProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Valor R$"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
            <Input
              type="date"
              value={form.data_emissao}
              onChange={(e) => setForm({ ...form, data_emissao: e.target.value })}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_140px]">
            <Input
              placeholder="Descrição (opcional)"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
            <Button onClick={() => emitir.mutate()} disabled={emitir.isPending} className="bg-primary text-primary-foreground">
              Emitir
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[80px_1.5fr_1fr_100px_120px_100px_100px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Nº</span>
            <span>Cliente / Projeto</span>
            <span>Descrição</span>
            <span>Emissão</span>
            <span>Status</span>
            <span className="text-right">Valor</span>
            <span />
          </div>
          {invoices.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma fatura emitida ainda.</div>
          ) : (
            invoices.map((i) => (
              <InvoiceRow
                key={i.id}
                invoice={i}
                onChangeStatus={(status) => mudarStatus.mutate({ id: i.id, status })}
                onDelete={async () => {
                  if (!(await confirmar({ title: "Excluir esta fatura?", confirmText: "Excluir", destructive: true }))) return;
                  const { error } = await (supabase as any).from("invoices").delete().eq("id", i.id);
                  if (error) return toast.error("Não excluiu", { description: error.message });
                  qc.invalidateQueries({ queryKey: ["invoices"] });
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Quando marcar como <strong>Paga</strong>, um snapshot da fatura é gravado no cache do Conta Azul
        (<code>invoice_paid_snapshot</code>) — a Edge Function existente cuida da reconciliação.
      </p>
    </div>
  );
}

function InvoiceRow({ invoice, onChangeStatus, onDelete }: { invoice: Invoice; onChangeStatus: (status: string) => void; onDelete: () => void }) {
  const statusColor: Record<string, string> = {
    rascunho: "bg-muted text-muted-foreground",
    enviada: "bg-primary/15 text-primary",
    paga: "bg-success/15 text-success",
    atrasada: "bg-destructive/15 text-destructive",
  };
  return (
    <div className="grid grid-cols-[80px_1.5fr_1fr_100px_120px_100px_100px] items-center gap-2 border-b border-border/40 px-5 py-3 text-sm last:border-0">
      <span className="font-mono text-xs text-muted-foreground">{invoice.numero || "—"}</span>
      <div className="min-w-0">
        <p className="truncate text-foreground">{invoice.client?.name || "—"}</p>
        <p className="truncate text-xs text-muted-foreground">{invoice.project?.name || "sem projeto"}</p>
      </div>
      <span className="truncate text-xs text-muted-foreground">{invoice.descricao || "—"}</span>
      <span className="text-xs text-muted-foreground">
        {new Date(invoice.data_emissao).toLocaleDateString("pt-BR")}
      </span>
      <Select value={invoice.status} onValueChange={onChangeStatus}>
        <SelectTrigger className={`h-7 text-xs ${statusColor[invoice.status] || ""}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="rascunho">Rascunho</SelectItem>
          <SelectItem value="enviada">Enviada</SelectItem>
          <SelectItem value="paga">Paga</SelectItem>
          <SelectItem value="atrasada">Atrasada</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-right text-sm font-medium text-primary">{formatCurrency(invoice.valor)}</span>
      <button onClick={onDelete} title="Excluir fatura" className="justify-self-end text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "text-success bg-success/15"
      : tone === "warning"
        ? "text-warning bg-warning/15"
        : tone === "destructive"
          ? "text-destructive bg-destructive/15"
          : "text-primary bg-primary/15";
  return (
    <Card className="glass-card">
      <CardContent className="space-y-2 p-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${cls}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
