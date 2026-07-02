import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClients } from "@/hooks/useDeals";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CANAIS_ENTRADA,
  TIPOS_ORCAMENTO,
  PRECISA_ROTEIRO,
  PRECISA_ELENCO,
  MOEDAS,
  FORMATOS,
  MEIOS_VEICULACAO,
} from "@/lib/orcamento-constants";

/**
 * Onda 5A — Novo orçamento no padrão Catalunya.
 * Entrada do pedido — o orçamento começa no estágio "lead".
 */
export default function NovoOrcamento() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clients, createClient } = useClients();

  const [form, setForm] = useState({
    title: "",
    client_id: "",
    novo_cliente: "",
    canal_entrada: "",
    tipo_orcamento: "",
    precisa_roteiro: "",
    precisa_elenco: "",
    local_filmagem: "",
    moeda: "BRL",
    objetivo: "",
    formatos: [] as string[],
    meios_veiculacao: [] as string[],
    verba_estimada: "",
  });

  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe o título");

      let clientId: string | null = form.client_id || null;
      if (!clientId && form.novo_cliente.trim()) {
        const created = await createClient.mutateAsync({ name: form.novo_cliente.trim() });
        clientId = created.id;
      }
      if (!clientId) throw new Error("Escolha um cliente ou informe um nome novo");

      const { data, error } = await (supabase as any)
        .from("deals")
        .insert({
          title: form.title,
          client_id: clientId,
          stage: "lead",
          probability: 10,
          value: form.verba_estimada ? Number(form.verba_estimada) : 0,
          canal_entrada: form.canal_entrada || null,
          tipo_orcamento: form.tipo_orcamento || null,
          precisa_roteiro: form.precisa_roteiro || null,
          precisa_elenco: form.precisa_elenco || null,
          local_filmagem: form.local_filmagem || null,
          moeda: form.moeda,
          objetivo: form.objetivo || null,
          formatos: form.formatos,
          meios_veiculacao: form.meios_veiculacao,
          verba_estimada: form.verba_estimada ? Number(form.verba_estimada) : null,
          created_by: user?.id || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (dealId) => {
      toast.success("Orçamento criado");
      navigate(`/orcamentos/${dealId}`);
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-6">
      <button
        onClick={() => navigate("/orcamentos")}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar ao pipeline
      </button>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Novo orçamento</h1>
        <p className="text-sm text-muted-foreground">
          Entrada do pedido — o orçamento começa no estágio <strong>“lead”</strong>.
        </p>
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Título do orçamento *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="[CLIENTE] Nome do projeto"
              />
            </div>

            <div>
              <Label>Cliente</Label>
              <Select
                value={form.client_id}
                onValueChange={(v) => setForm({ ...form, client_id: v, novo_cliente: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— selecionar —" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ou novo cliente</Label>
              <Input
                value={form.novo_cliente}
                onChange={(e) => setForm({ ...form, novo_cliente: e.target.value, client_id: "" })}
                placeholder="Nome do cliente"
              />
            </div>

            <div>
              <Label>Canal de entrada</Label>
              <Select
                value={form.canal_entrada}
                onValueChange={(v) => setForm({ ...form, canal_entrada: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CANAIS_ENTRADA.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de orçamento</Label>
              <Select
                value={form.tipo_orcamento}
                onValueChange={(v) => setForm({ ...form, tipo_orcamento: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ORCAMENTO.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Roteiro</Label>
              <Select
                value={form.precisa_roteiro}
                onValueChange={(v) => setForm({ ...form, precisa_roteiro: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PRECISA_ROTEIRO.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Elenco</Label>
              <Select
                value={form.precisa_elenco}
                onValueChange={(v) => setForm({ ...form, precisa_elenco: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PRECISA_ELENCO.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Local da filmagem</Label>
              <Input
                value={form.local_filmagem}
                onChange={(e) => setForm({ ...form, local_filmagem: e.target.value })}
              />
            </div>
            <div>
              <Label>Moeda</Label>
              <Select value={form.moeda} onValueChange={(v) => setForm({ ...form, moeda: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOEDAS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Objetivo do vídeo</Label>
            <Textarea
              rows={6}
              value={form.objetivo}
              onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
              placeholder="Qual é a mensagem-chave, o público-alvo e o que o cliente espera atingir?"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Label>Formatos</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {FORMATOS.map((f) => {
                  const on = form.formatos.includes(f.value);
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setForm({ ...form, formatos: toggle(form.formatos, f.value) })}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                        on ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-sm border ${on ? "border-primary bg-primary" : "border-border"}`} />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Meio de veiculação</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {MEIOS_VEICULACAO.map((m) => {
                  const on = form.meios_veiculacao.includes(m.value);
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm({ ...form, meios_veiculacao: toggle(form.meios_veiculacao, m.value) })}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                        on ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-sm border ${on ? "border-primary bg-primary" : "border-border"}`} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Verba estimada</Label>
              <Input
                type="number"
                value={form.verba_estimada}
                onChange={(e) => setForm({ ...form, verba_estimada: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>

          <Button
            onClick={() => criar.mutate()}
            disabled={criar.isPending}
            className="bg-primary text-primary-foreground"
          >
            {criar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Criar orçamento
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
