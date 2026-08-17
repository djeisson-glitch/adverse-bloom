import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ui/confirm";
import { Package, Plus, Trash2, Loader2, AlertTriangle, ChevronRight, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientesPublico } from "@/hooks/useDeals";
import { hojeISO } from "@/lib/dataLocal";
import { toast } from "sonner";

/**
 * Planos recorrentes — o catálogo de pacotes.
 *
 * Djêisson (13/08/2026): "vamos ter tanto as entregas quanto horas. pro
 * cliente vamos vender entregas, mas interno vamos entender as horas daquele
 * material."
 *
 * É por isso que cada item do escopo tem DUAS colunas que parecem redundantes
 * e não são: `quantidade` é o que vai na proposta ("4 vídeos"), `horas` é o
 * que decide se o plano se paga. Vender por entrega e custear por hora é o
 * jeito de descobrir que o plano bonito dá prejuízo ANTES de assiná-lo.
 *
 * O custo/hora vem do rate card — a mesma tabela do resto do sistema. Item
 * sem função escolhida entra com custo ZERO e a tela avisa: hora sem dono de
 * custo empurra a margem pra cima e é o erro mais caro desta tela.
 */

const DURACOES = [3, 6, 12];
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function Planos() {
  const qc = useQueryClient();
  const confirmar = useConfirm();
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState({ nome: "", duracao_meses: 12, valor_mensal: "" });

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ["planos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("planos_v").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!novo.nome.trim()) throw new Error("Dê um nome ao plano");
      const { data, error } = await (supabase as any).from("planos").insert({
        nome: novo.nome.trim(),
        duracao_meses: novo.duracao_meses,
        valor_mensal: Number(novo.valor_mensal) || 0,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setNovo({ nome: "", duracao_meses: 12, valor_mensal: "" });
      qc.invalidateQueries({ queryKey: ["planos"] });
      setAberto(id);   // já abre pra montar o escopo, que é o trabalho de verdade
    },
    onError: (e: any) => toast.error("Não criou", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Planos</h1>
          <p className="text-sm text-muted-foreground">
            Pacotes recorrentes: o cliente compra entregas, a gente custeia horas.
          </p>
        </div>
      </div>

      <DegrausDeDesconto />

      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-end gap-2 p-4">
          <div className="min-w-[180px] flex-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome do plano</Label>
            <Input
              value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && criar.mutate()}
              placeholder="ex.: Essencial" className="h-9"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contrato</Label>
            <Select value={String(novo.duracao_meses)} onValueChange={(v) => setNovo({ ...novo, duracao_meses: Number(v) })}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURACOES.map((m) => <SelectItem key={m} value={String(m)}>{m} meses</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor mensal</Label>
            <Input
              type="number" value={novo.valor_mensal}
              onChange={(e) => setNovo({ ...novo, valor_mensal: e.target.value })}
              placeholder="8000" className="h-9 w-32"
            />
          </div>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="h-9">
            <Plus className="mr-1 h-4 w-4" /> Criar plano
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : planos.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum plano ainda. Crie o primeiro acima — depois monte o escopo mensal dentro dele.
        </p>
      ) : (
        <div className="space-y-3">
          {planos.map((p: any) => (
            <PlanoCard
              key={p.id} p={p}
              aberto={aberto === p.id}
              onToggle={() => setAberto(aberto === p.id ? null : p.id)}
              confirmar={confirmar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanoCard({ p, aberto, onToggle, confirmar }: {
  p: any; aberto: boolean; onToggle: () => void; confirmar: any;
}) {
  const qc = useQueryClient();
  const magra = p.margem_percent < 30;

  const salvar = async (patch: any) => {
    const { error } = await (supabase as any).from("planos").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) return toast.error("Não salvou", { description: error.message });
    qc.invalidateQueries({ queryKey: ["planos"] });
  };

  return (
    <Card className={`glass-card overflow-hidden border-l-[3px] ${magra ? "border-l-destructive" : "border-l-success"}`}>
      <CardContent className="p-0">
        <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-sidebar-accent/30">
          <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground ${aberto ? "rotate-90" : ""}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-foreground">{p.nome}</span>
            <span className="block text-xs text-muted-foreground">
              {p.duracao_meses} meses · {p.entregas_mes || 0} entregas/mês
              {Number(p.diarias_mes || 0) > 0 ? ` · ${Number(p.diarias_mes)} diárias` : ""}
              {" · "}{Number(p.horas_mes || 0).toFixed(1)}h/mês
              {p.budget_id ? " · do orçamento" : ""}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-medium text-foreground">{brl(p.valor_mensal)}<span className="text-xs text-muted-foreground">/mês</span></span>
            <span className="block text-xs text-muted-foreground">{brl(p.valor_contrato)} no contrato</span>
          </span>
          <span className="w-24 shrink-0 text-right">
            <span className={`block text-sm font-semibold ${magra ? "text-destructive" : "text-success"}`}>
              {Number(p.margem_percent || 0).toFixed(0)}%
            </span>
            <span className="block text-xs text-muted-foreground">margem</span>
          </span>
        </button>

        {aberto && (
          <div className="space-y-4 border-t border-border/50 px-5 py-4">
            {/* Horas sem função escolhida entram com custo ZERO e inflam a
                margem. É o erro mais caro desta tela, então ele grita. */}
            {Number(p.horas_sem_funcao || 0) > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.07] p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs leading-snug text-foreground">
                  <b>{Number(p.horas_sem_funcao).toFixed(1)}h por mês sem função escolhida</b> — elas entram com custo
                  zero e a margem acima está mais alta do que a real. Escolha a função de cada item abaixo.
                </p>
              </div>
            )}

            <Resumo p={p} />
            <ItensDoPlano planoId={p.id} confirmar={confirmar} />

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor mensal</Label>
                <Input
                  type="number" defaultValue={p.valor_mensal} className="h-8"
                  onBlur={(e) => Number(e.target.value) !== Number(p.valor_mensal) && salvar({ valor_mensal: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contrato</Label>
                <Select value={String(p.duracao_meses)} onValueChange={(v) => salvar({ duracao_meses: Number(v) })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{DURACOES.map((m) => <SelectItem key={m} value={String(m)}>{m} meses</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total do contrato
                </Label>
                <Input
                  type="number" defaultValue={p.valor_total ?? ""} placeholder={String(p.valor_mensal * p.duracao_meses)}
                  className="h-8"
                  onBlur={(e) => salvar({ valor_total: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Vazio = mensal × meses. Preencha só pra dar desconto no fechado.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">O que o cliente lê</Label>
              <Textarea
                rows={2} defaultValue={p.descricao || ""} placeholder="Resumo do plano pra proposta…"
                onBlur={(e) => e.target.value !== (p.descricao || "") && salvar({ descricao: e.target.value || null })}
              />
            </div>

            <AplicarAoCliente plano={p} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Os números do plano — mensal e contrato, lado a lado. */
function Resumo({ p }: { p: any }) {
  const linha = (rot: string, valor: string, forte?: boolean, tom?: string) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{rot}</span>
      <span className={`${forte ? "font-semibold" : ""} ${tom || "text-foreground"}`}>{valor}</span>
    </div>
  );
  const magra = p.margem_percent < 30;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1 rounded-lg border border-border/50 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Por mês</p>
        {linha("Recebe", brl(p.valor_mensal))}
        {linha("Custo previsto", brl(p.custo_mensal))}
        {linha("Margem", `${brl(p.margem_mensal)} · ${Number(p.margem_percent || 0).toFixed(0)}%`, true,
          magra ? "text-destructive" : "text-success")}
      </div>
      <div className="space-y-1 rounded-lg border border-border/50 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          No contrato · {p.duracao_meses} meses
        </p>
        {linha("Recebe", brl(p.valor_contrato))}
        {linha("Custo previsto", brl(p.custo_contrato))}
        {linha("Margem", brl(p.margem_contrato), true, magra ? "text-destructive" : "text-success")}
      </div>
    </div>
  );
}

/** O escopo mensal: o que o cliente compra (quantidade) e o que custa (horas). */
function ItensDoPlano({ planoId, confirmar }: { planoId: string; confirmar: any }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ descricao: "", quantidade: "1", horas_unidade: "", rate_card_id: "" });

  const { data: itens = [] } = useQuery({
    queryKey: ["plano-itens", planoId],
    queryFn: async () => (await (supabase as any).from("plano_itens").select("*").eq("plano_id", planoId).order("ordem")).data || [],
  });
  const { data: funcoes = [] } = useQuery({
    queryKey: ["rate-card-ativo"],
    queryFn: async () => (await (supabase as any).from("rate_card").select("id, funcao, custo_hora").eq("ativo", true).order("ordem")).data || [],
    staleTime: 10 * 60 * 1000,
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["plano-itens", planoId] });
    qc.invalidateQueries({ queryKey: ["planos"] });   // a margem muda junto
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!novo.descricao.trim()) throw new Error("Descreva a entrega");
      const { error } = await (supabase as any).from("plano_itens").insert({
        plano_id: planoId,
        descricao: novo.descricao.trim(),
        quantidade: Number(novo.quantidade) || 0,
        horas_unidade: Number(novo.horas_unidade) || 0,
        rate_card_id: novo.rate_card_id || null,
        ordem: itens.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNovo({ descricao: "", quantidade: "1", horas_unidade: "", rate_card_id: "" }); recarregar(); },
    onError: (e: any) => toast.error("Não adicionou", { description: e.message }),
  });

  const fn = (id: string) => funcoes.find((f: any) => f.id === id);

  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Escopo mensal · {itens.length} {itens.length === 1 ? "item" : "itens"}
      </p>

      <div className="overflow-hidden rounded-lg border border-border/50">
        <div className="grid grid-cols-[1fr_60px_70px_150px_100px_32px] gap-2 border-b border-border/50 bg-muted/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Entrega (o cliente lê)</span><span className="text-right">Qtd</span>
          <span className="text-right">h/un</span><span>Função</span>
          <span className="text-right">Custo/mês</span><span />
        </div>

        {itens.map((it: any) => {
          const f = fn(it.rate_card_id);
          const custo = (it.quantidade || 0) * (it.horas_unidade || 0) * (f?.custo_hora || 0);
          return (
            <div key={it.id} className="grid grid-cols-[1fr_60px_70px_150px_100px_32px] items-center gap-2 border-b border-border/30 px-3 py-1.5 text-sm last:border-0">
              <span className="truncate text-foreground" title={it.descricao}>{it.descricao}</span>
              <span className="text-right text-muted-foreground">{Number(it.quantidade)}</span>
              <span className="text-right text-muted-foreground">{Number(it.horas_unidade)}</span>
              <span className={`truncate text-xs ${f ? "text-muted-foreground" : "text-warning"}`}>
                {f?.funcao || "sem função"}
              </span>
              <span className="text-right text-xs text-muted-foreground">{brl(custo)}</span>
              <button
                onClick={async () => {
                  if (!(await confirmar({ title: "Remover este item?", confirmText: "Remover", destructive: true }))) return;
                  await (supabase as any).from("plano_itens").delete().eq("id", it.id);
                  recarregar();
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        <div className="grid grid-cols-[1fr_60px_70px_150px_100px_32px] items-center gap-2 px-3 py-2">
          <Input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && add.mutate()}
            placeholder="ex.: Vídeo institucional 1min" className="h-8 text-sm" />
          <Input type="number" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} className="h-8 text-right text-sm" />
          <Input type="number" value={novo.horas_unidade} onChange={(e) => setNovo({ ...novo, horas_unidade: e.target.value })} placeholder="5" className="h-8 text-right text-sm" />
          <Select value={novo.rate_card_id} onValueChange={(v) => setNovo({ ...novo, rate_card_id: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="função" /></SelectTrigger>
            <SelectContent>
              {funcoes.map((f: any) => (
                <SelectItem key={f.id} value={f.id}>{f.funcao} · {brl(f.custo_hora)}/h</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span />
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Aplicar o plano a um cliente.
 *
 * Copia nome, valor e custo previsto: o catálogo é modelo, o contrato é
 * promessa. Se o rate card subir em outubro, a margem prevista do contrato
 * assinado em agosto não pode mudar sozinha — ela é o que foi vendido.
 */
function AplicarAoCliente({ plano }: { plano: any }) {
  const qc = useQueryClient();
  const { clientes } = useClientesPublico();
  const [cli, setCli] = useState("");
  const [inicio, setInicio] = useState(hojeISO());

  const { data: aplicados = [] } = useQuery({
    queryKey: ["cliente-planos", plano.id],
    queryFn: async () => (await (supabase as any).from("cliente_planos").select("*").eq("plano_id", plano.id).order("inicio", { ascending: false })).data || [],
  });

  const aplicar = useMutation({
    mutationFn: async () => {
      if (!cli) throw new Error("Escolha o cliente");
      const { error } = await (supabase as any).from("cliente_planos").insert({
        client_id: cli,
        plano_id: plano.id,
        nome: plano.nome,
        inicio,
        meses: plano.duracao_meses,
        valor_mensal: plano.valor_mensal,
        custo_previsto: plano.custo_mensal,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCli("");
      qc.invalidateQueries({ queryKey: ["cliente-planos", plano.id] });
      toast.success("Plano aplicado ao cliente");
    },
    onError: (e: any) => toast.error("Não aplicou", { description: e.message }),
  });

  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <UserPlus className="h-3 w-3" /> Contratos deste plano
      </p>

      {aplicados.length > 0 && (
        <div className="mb-3 space-y-1">
          {aplicados.map((a: any) => {
            const c = clientes.find((x: any) => x.id === a.client_id);
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-foreground">{c?.name || "cliente"}</span>
                <span className="text-muted-foreground">
                  {new Date(a.inicio + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} ·
                  {" "}{a.meses} meses · {brl(a.valor_mensal)}/mês
                </span>
                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${a.status === "ativo" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {a.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <Select value={cli} onValueChange={setCli}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
            <SelectContent>
              {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-8 w-36 text-xs" />
        <Button size="sm" variant="outline" className="h-8" onClick={() => aplicar.mutate()} disabled={aplicar.isPending}>
          Aplicar ao cliente
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Valor e custo são congelados na aplicação — reajuste no rate card não mexe em contrato já assinado.
      </p>
    </div>
  );
}

/**
 * Os degraus de desconto por prazo — o PADRÃO da casa.
 *
 * Djêisson (14/08/2026): "quero q deixe um campo pra ele e que a gente possa
 * editar quando quiser". Configuração que ninguém consegue mexer é constante
 * com passo extra.
 *
 * Isto é a política; cada orçamento ainda pode ter o desconto dele (o campo
 * no editor). As duas coisas são verdade ao mesmo tempo: existe uma regra da
 * casa e existe a negociação específica.
 */
function DegrausDeDesconto() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ meses: "", percent: "" });

  const { data: degraus = [] } = useQuery({
    queryKey: ["plano-descontos-admin"],
    queryFn: async () => (await (supabase as any).from("plano_descontos").select("*").order("meses")).data || [],
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["plano-descontos-admin"] });
    qc.invalidateQueries({ queryKey: ["plano-descontos"] });
  };

  const salvar = async (meses: number, percent: number) => {
    const { error } = await (supabase as any).from("plano_descontos").upsert({ meses, percent, ativo: true });
    if (error) return toast.error("Não salvou", { description: error.message });
    recarregar();
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Desconto por prazo · padrão da casa
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {degraus.map((d: any) => (
            <div key={d.meses}>
              <Label className="text-[10px] text-muted-foreground">{d.meses} meses</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number" step="0.5" defaultValue={d.percent} className="h-8 w-20 text-sm"
                  onBlur={(e) => Number(e.target.value) !== Number(d.percent) && salvar(d.meses, Number(e.target.value) || 0)}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}

          <div className="flex items-end gap-1">
            <div>
              <Label className="text-[10px] text-muted-foreground">novo prazo</Label>
              <Input type="number" value={novo.meses} onChange={(e) => setNovo({ ...novo, meses: e.target.value })}
                placeholder="24" className="h-8 w-20 text-sm" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">%</Label>
              <Input type="number" step="0.5" value={novo.percent} onChange={(e) => setNovo({ ...novo, percent: e.target.value })}
                placeholder="15" className="h-8 w-20 text-sm" />
            </div>
            <Button
              size="sm" variant="outline" className="h-8"
              onClick={async () => {
                const m = Number(novo.meses);
                if (!m) return toast.error("Informe o prazo em meses");
                await salvar(m, Number(novo.percent) || 0);
                setNovo({ meses: "", percent: "" });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Prazo sem degrau exato usa o maior que couber — 9 meses pega o de 6. Cada orçamento
          ainda pode ter o desconto próprio dele.
        </p>
      </CardContent>
    </Card>
  );
}
