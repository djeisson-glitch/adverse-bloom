import { useState } from "react";
import { useVoltar } from "@/hooks/useVoltar";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ui/confirm";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, Loader2, Trash2, Trophy, StickyNote, Mail, MessageCircle, Phone, Users, Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TEMPERATURAS, STATUSES, ORIGENS } from "./Leads";

const TIPOS_INT = [
  { v: "nota", l: "Nota", icon: StickyNote },
  { v: "email", l: "E-mail", icon: Mail },
  { v: "whatsapp", l: "WhatsApp", icon: MessageCircle },
  { v: "ligacao", l: "Ligação", icon: Phone },
  { v: "reuniao", l: "Reunião", icon: Users },
];
const tipoInfo = (t: string) => TIPOS_INT.find((x) => x.v === t) || TIPOS_INT[0];

export default function LeadDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const voltar = useVoltar("/leads");
  const qc = useQueryClient();
  const { user } = useAuth();
  const confirmar = useConfirm();

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ["lead", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("leads").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: interacoes = [] } = useQuery({
    queryKey: ["lead-interacoes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lead_interacoes")
        .select("*")
        .eq("lead_id", id!)
        .order("data", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [form, setForm] = useState<any>(null);
  if (lead && (!form || form.__id !== lead.id)) {
    setForm({
      __id: lead.id,
      nome: lead.nome || "",
      empresa: lead.empresa || "",
      email: lead.email || "",
      telefone: lead.telefone || "",
      origem: lead.origem || "outbound",
      temperatura: lead.temperatura || "frio",
      status: lead.status || "novo",
      proximo_toque: lead.proximo_toque || "",
      observacoes: lead.observacoes || "",
    });
  }

  const salvar = (patch: any) => {
    setForm((f: any) => ({ ...f, ...patch }));
    (supabase as any).from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).then(({ error }: any) => {
      if (error) toast.error("Não salvou", { description: error.message });
      else qc.invalidateQueries({ queryKey: ["leads"] });
    });
  };

  const [novaInt, setNovaInt] = useState({ tipo: "nota", descricao: "" });
  const addInteracao = useMutation({
    mutationFn: async () => {
      if (!novaInt.descricao.trim()) throw new Error("Escreva a interação");
      const { error } = await (supabase as any).from("lead_interacoes").insert({
        lead_id: id, tipo: novaInt.tipo, descricao: novaInt.descricao.trim(), user_id: user?.id ?? null,
      });
      if (error) throw error;
      // registrar interação = esquenta um pouco: novo → em nutrição
      if (form?.status === "novo") salvar({ status: "em_nutricao" });
    },
    onSuccess: () => {
      setNovaInt({ tipo: "nota", descricao: "" });
      qc.invalidateQueries({ queryKey: ["lead-interacoes", id] });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const virarOrcamento = useMutation({
    mutationFn: async () => {
      let clientId = lead.client_id;
      if (!clientId) {
        const { data: c, error: ce } = await (supabase as any).from("clients").insert({
          name: lead.empresa || lead.nome,
          contact_name: lead.nome,
          type: "cliente",
        }).select("id").single();
        if (ce) throw ce;
        clientId = c.id;
      }
      const { data: d, error: de } = await (supabase as any).from("deals").insert({
        title: lead.empresa || lead.nome,
        client_id: clientId,
        stage: "lead",
        value: 0,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (de) throw de;
      await (supabase as any).from("leads").update({ status: "convertido", client_id: clientId, deal_id: d.id }).eq("id", lead.id);
      return d.id as string;
    },
    onSuccess: (dealId) => {
      toast.success("Virou orçamento!");
      navigate(`/orcamentos/${dealId}`);
    },
    onError: (e: any) => toast.error("Não converteu", { description: e.message }),
  });

  if (isError) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-sm text-muted-foreground">Lead não encontrado.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={voltar}>Voltar</Button>
      </div>
    );
  }
  if (isLoading || !form) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex items-center justify-between">
        <button onClick={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <button
          onClick={async () => {
            if (!(await confirmar({ title: "Excluir este lead?", confirmText: "Excluir", destructive: true }))) return;
            const { error } = await (supabase as any).from("leads").delete().eq("id", id);
            if (error) return toast.error("Não excluiu", { description: error.message });
            toast.success("Lead excluído");
            navigate("/leads");
          }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </button>
      </div>

      {/* Header + dados */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} onBlur={() => salvar({ nome: form.nome })} className="border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight hover:border-border focus:border-border" />
              <Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} onBlur={() => salvar({ empresa: form.empresa })} placeholder="Empresa" className="mt-1 h-7 border-transparent bg-transparent px-0 text-sm text-muted-foreground hover:border-border focus:border-border" />
            </div>
            {form.status !== "convertido" ? (
              <Button onClick={() => virarOrcamento.mutate()} disabled={virarOrcamento.isPending} className="bg-success text-white hover:bg-success/90">
                <Trophy className="mr-1.5 h-3.5 w-3.5" /> Virar orçamento
              </Button>
            ) : (
              <Button variant="outline" onClick={() => lead.deal_id && navigate(`/orcamentos/${lead.deal_id}`)}>
                Ver orçamento
              </Button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Campo label="Temperatura">
              <Select value={form.temperatura} onValueChange={(v) => salvar({ temperatura: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{TEMPERATURAS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Status">
              <Select value={form.status} onValueChange={(v) => salvar({ status: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Próximo toque">
              <Input type="date" value={form.proximo_toque || ""} onChange={(e) => salvar({ proximo_toque: e.target.value || null })} className="h-8" />
            </Campo>
            <Campo label="Origem">
              <Select value={form.origem} onValueChange={(v) => salvar({ origem: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGENS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="E-mail">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => salvar({ email: form.email || null })} className="h-8" />
            </Campo>
            <Campo label="Telefone / WhatsApp">
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} onBlur={() => salvar({ telefone: form.telefone || null })} className="h-8" />
            </Campo>
          </div>
          <Campo label="Observações">
            <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} onBlur={() => salvar({ observacoes: form.observacoes || null })} placeholder="Contexto, dores, notas do relacionamento…" />
          </Campo>
        </CardContent>
      </Card>

      {/* Timeline de interações */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm font-semibold text-foreground">Interações</p>

          <div className="flex flex-wrap items-start gap-2">
            <Select value={novaInt.tipo} onValueChange={(v) => setNovaInt({ ...novaInt, tipo: v })}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_INT.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
            <Input
              value={novaInt.descricao}
              onChange={(e) => setNovaInt({ ...novaInt, descricao: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addInteracao.mutate()}
              placeholder="O que rolou? (ex.: enviei proposta por e-mail)"
              className="h-9 min-w-[200px] flex-1"
            />
            <Button size="sm" onClick={() => addInteracao.mutate()} disabled={addInteracao.isPending} className="h-9">
              <Plus className="mr-1 h-4 w-4" /> Registrar
            </Button>
          </div>

          {interacoes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma interação ainda. Registre o primeiro toque.</p>
          ) : (
            <div className="space-y-3">
              {interacoes.map((it: any) => {
                const info = tipoInfo(it.tipo);
                const Icon = info.icon;
                return (
                  <div key={it.id} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 border-b border-border/30 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{info.l}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(it.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <button
                          onClick={async () => {
                            await (supabase as any).from("lead_interacoes").delete().eq("id", it.id);
                            qc.invalidateQueries({ queryKey: ["lead-interacoes", id] });
                          }}
                          className="ml-auto text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      {it.descricao && <p className="mt-0.5 text-sm text-foreground">{it.descricao}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
