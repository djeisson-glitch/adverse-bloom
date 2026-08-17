import { useState } from "react";
import { useVoltar } from "@/hooks/useVoltar";
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
import { nomeCodigo, semPrefixoCodigo } from "@/lib/codigo";
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
  const voltar = useVoltar("/orcamentos");
  const { user } = useAuth();
  const { clients, createClient, updateClient } = useClients();

  const [form, setForm] = useState({
    // Avulso ou plano JÁ aqui: quem cria o orçamento sabe qual é, e escolher
    // só depois faz o budget nascer avulso um clique após a pessoa ter dito
    // que é plano.
    recorrente: false,
    contrato_meses: 12,
    title: "",
    client_id: "",
    novo_cliente: "",
    // Responsável do cliente novo. Cliente nasce AQUI na prática — foi por
    // este caminho que 8 dos 9 clientes ficaram sem contato nenhum. Pedir o
    // nome sem pedir quem responde por ele é jogar fora a informação no
    // momento exato em que ela está na mão de quem atende.
    novo_contato_nome: "",
    novo_contato_celular: "",
    novo_contato_email: "",
    // Contato de cliente JÁ cadastrado: preenchido a partir da ficha quando
    // existe, editável quando falta. Hoje falta em 8 dos 9 — mostrar vazio e
    // não deixar completar seria só informar o problema.
    contato_nome: "",
    contato_celular: "",
    contato_email: "",
    canal_entrada: "",
    tipo_orcamento: "",
    porte: "grande",
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
      if (!form.title.trim()) throw new Error("Informe o nome do projeto");

      let clientId: string | null = form.client_id || null;
      if (!clientId && form.novo_cliente.trim()) {
        const created = await createClient.mutateAsync({
          name: form.novo_cliente.trim(),
          contact_name: form.novo_contato_nome.trim() || null,
          phone: form.novo_contato_celular.trim() || null,
          email: form.novo_contato_email.trim() || null,
        });
        clientId = created.id;
      }
      if (!clientId) throw new Error("Escolha um cliente ou informe um nome novo");

      // Cliente existente sem contato: o que foi digitado aqui vai pra FICHA
      // dele, não fica preso no orçamento. É o mesmo dado, e o lugar dele é a
      // ficha — senão cada orçamento teria uma versão do contato.
      if (form.client_id) {
        const atual: any = clients.find((x: any) => x.id === form.client_id);
        const patch: Record<string, string | null> = {};
        if (form.contato_nome.trim() && form.contato_nome.trim() !== (atual?.contact_name || "")) patch.contact_name = form.contato_nome.trim();
        if (form.contato_celular.trim() && form.contato_celular.trim() !== (atual?.phone || "")) patch.phone = form.contato_celular.trim();
        if (form.contato_email.trim() && form.contato_email.trim() !== (atual?.email || "")) patch.email = form.contato_email.trim();
        if (Object.keys(patch).length) {
          await updateClient.mutateAsync({ id: form.client_id, ...patch } as any);
        }
      }

      const { data, error } = await (supabase as any)
        .from("deals")
        .insert({
          title: form.title,
          client_id: clientId,
          stage: "lead",
          probability: 10,
          value: form.verba_estimada ? Number(form.verba_estimada) : 0,
          canal_entrada: form.canal_entrada || null,
          recorrente: form.recorrente,
          contrato_meses: form.recorrente ? form.contrato_meses : null,
          tipo_orcamento: form.tipo_orcamento || null,
          porte: form.porte,
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
        onClick={voltar}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
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
            {/* O código na frente é carimbado pelo banco na hora de criar —
                digitar aqui só duplicaria. É o MESMO número que vai pro nome
                do projeto, pro entregável e pra pasta no Drive. */}
            <div className="md:col-span-2">
              <Label>Nome do projeto *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Nome do projeto"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                O sistema põe o número na frente ao criar:{" "}
                <span className="font-mono text-foreground">
                  [XXXX]_{nomeCodigo(semPrefixoCodigo(form.title)) || "NOME_DO_PROJETO"}
                </span>
                {" "}— e é o mesmo número que o projeto vai herdar.
              </p>
            </div>

            <div>
              <Label>Cliente</Label>
              <Select
                value={form.client_id}
                onValueChange={(v) => {
                  const c: any = clients.find((x: any) => x.id === v);
                  setForm({
                    ...form, client_id: v, novo_cliente: "",
                    contato_nome: c?.contact_name || "",
                    contato_celular: c?.phone || "",
                    contato_email: c?.email || "",
                  });
                }}
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

            {/* Cliente JÁ cadastrado: mostra quem é o contato lá dentro. Se
                não houver, os campos vêm vazios pra completar na hora — e o
                que for digitado vai pra ficha do cliente, não fica preso
                neste orçamento. */}
            {form.client_id && (
              <div className="md:col-span-2">
                <Label>Contato nesta empresa</Label>
                <div className="mt-1 grid gap-2 md:grid-cols-3">
                  <Input
                    value={form.contato_nome}
                    onChange={(e) => setForm({ ...form, contato_nome: e.target.value })}
                    placeholder="Nome do responsável"
                  />
                  <Input
                    value={form.contato_celular}
                    onChange={(e) => setForm({ ...form, contato_celular: e.target.value })}
                    placeholder="Celular"
                  />
                  <Input
                    type="email"
                    value={form.contato_email}
                    onChange={(e) => setForm({ ...form, contato_email: e.target.value })}
                    placeholder="E-mail"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {form.contato_nome || form.contato_celular || form.contato_email
                    ? "Vem da ficha do cliente. Editar aqui atualiza a ficha."
                    : "Ainda não temos contato dessa empresa — preencha e fica salvo na ficha."}
                </p>
              </div>
            )}

            {/* Cliente NOVO: o contato nasce junto. */}
            {form.novo_cliente.trim() && (
              <div className="md:col-span-2">
                <Label>Quem responde por esse cliente</Label>
                <div className="mt-1 grid gap-2 md:grid-cols-3">
                  <Input
                    value={form.novo_contato_nome}
                    onChange={(e) => setForm({ ...form, novo_contato_nome: e.target.value })}
                    placeholder="Nome do responsável"
                  />
                  <Input
                    value={form.novo_contato_celular}
                    onChange={(e) => setForm({ ...form, novo_contato_celular: e.target.value })}
                    placeholder="Celular"
                  />
                  <Input
                    type="email"
                    value={form.novo_contato_email}
                    onChange={(e) => setForm({ ...form, novo_contato_email: e.target.value })}
                    placeholder="E-mail"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Fica na ficha do cliente e serve pro orçamento, pro portal e pra cobrança.
                </p>
              </div>
            )}

            {/* Avulso ou plano. Vem antes do resto porque muda o que o
                orçamento é: num plano, a planilha vira a MENSALIDADE e o
                contrato tem prazo. */}
            <div>
              <Label>Tipo de orçamento</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="flex overflow-hidden rounded-md border border-border/60">
                  {[false, true].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setForm({ ...form, recorrente: v })}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        form.recorrente === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v ? "Plano recorrente" : "Avulso"}
                    </button>
                  ))}
                </div>
                {form.recorrente && (
                  <Select
                    value={String(form.contrato_meses)}
                    onValueChange={(v) => setForm({ ...form, contrato_meses: Number(v) })}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 6, 12].map((m) => <SelectItem key={m} value={String(m)}>{m} meses</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {form.recorrente && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A planilha vira o escopo mensal, e o desconto do prazo entra na mensalidade.
                </p>
              )}
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
              <Label>Porte do projeto</Label>
              <Select value={form.porte} onValueChange={(v) => setForm({ ...form, porte: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grande">Grande (planilha completa)</SelectItem>
                  <SelectItem value="medio">Médio (planilha reduzida)</SelectItem>
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
