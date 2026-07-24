import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave, type StatusSalvamento } from "@/components/autosave/AutosaveContext";

type Modelo = "nenhum" | "horas" | "tabela" | "contrato";
type Preco = { id?: string; tipo: string; preco: number; ordem: number };

const MODELO_LABEL: Record<Modelo, string> = {
  nenhum: "Não fatura por aqui",
  horas: "Por hora (horas do mês × valor-hora)",
  tabela: "Tabela de preço (preço fixo por tipo de entrega)",
  contrato: "Contrato (valor fixo mensal + franquia)",
};

function mesAnteriorISO() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function FaturamentoConfig({ clientId, clientName }: { clientId: string; clientName: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: cfg, isSuccess: cfgPronto } = useQuery({
    queryKey: ["client_faturamento", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_faturamento").select("*").eq("client_id", clientId).maybeSingle();
      return data;
    },
  });
  const { data: precosDB } = useQuery({
    queryKey: ["client_precos", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_precos").select("*").eq("client_id", clientId).order("ordem");
      return (data || []) as Preco[];
    },
  });
  const { data: contratoDB } = useQuery({
    queryKey: ["client_contratos", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_contratos").select("*").eq("client_id", clientId).eq("ativo", true).order("created_at", { ascending: false }).maybeSingle();
      return data;
    },
  });

  const [modelo, setModelo] = useState<Modelo>("nenhum");
  const [valorHora, setValorHora] = useState("0");
  const [imposto, setImposto] = useState("0");
  const [margem, setMargem] = useState("0");
  const [autoMensal, setAutoMensal] = useState(true);
  const [obs, setObs] = useState("");
  const [precos, setPrecos] = useState<Preco[]>([]);
  const [contrato, setContrato] = useState({ nome: "Contrato", valor_mensal: "0", diarias_mes: "0", entregas_mes: "0", acumulo_meses: "2", inicio: "", valor_diaria_extra: "0", valor_entrega_extra: "0" });

  // Semeia o formulário UMA vez por cliente. A tela atualiza sozinha a cada 30s;
  // seguir a query a cada refetch apagaria o que a pessoa está digitando.
  const semeado = useRef<string | null>(null);
  useEffect(() => {
    if (!cfgPronto || semeado.current === clientId) return;
    semeado.current = clientId;
    if (!cfg) return;   // cliente ainda sem config: fica nos padrões da tela
    setModelo((cfg.modelo as Modelo) || "nenhum");
    setValorHora(String(cfg.valor_hora ?? 0));
    setImposto(String(cfg.imposto_percent ?? 0));
    setMargem(String(cfg.margem_percent ?? 0));
    setAutoMensal(cfg.auto_mensal ?? true);
    setObs(cfg.observacoes || "");
  }, [cfg, cfgPronto, clientId]);

  const semeadoPrecos = useRef<string | null>(null);
  useEffect(() => {
    if (!precosDB || semeadoPrecos.current === clientId) return;
    semeadoPrecos.current = clientId;
    setPrecos(precosDB);
  }, [precosDB, clientId]);

  // Guarda o id do contrato criado no meio da edição: sem isso, o patch seguinte
  // inseriria um segundo contrato antes de o refetch trazer o primeiro.
  const contratoIdRef = useRef<string | null>(null);
  const semeadoContrato = useRef<string | null>(null);
  useEffect(() => {
    if (!contratoDB || semeadoContrato.current === clientId) return;
    semeadoContrato.current = clientId;
    contratoIdRef.current = contratoDB.id;
    setContrato({
      nome: contratoDB.nome || "Contrato",
      valor_mensal: String(contratoDB.valor_mensal ?? 0),
      diarias_mes: String(contratoDB.diarias_mes ?? 0),
      entregas_mes: String(contratoDB.entregas_mes ?? 0),
      acumulo_meses: String(contratoDB.acumulo_meses ?? 2),
      valor_diaria_extra: String(contratoDB.valor_diaria_extra ?? 0),
      valor_entrega_extra: String(contratoDB.valor_entrega_extra ?? 0),
      inicio: contratoDB.inicio || "",
    });
  }, [contratoDB, clientId]);

  // Valor/hora, margem e imposto são dinheiro: continuam indo pelo MESMO caminho
  // de gravação de antes (upsert em client_faturamento, protegido por RLS).
  // O upsert leva o client_id junto porque a config pode ainda não existir.
  const gravarCfg = async (patch: Record<string, unknown>) => {
    const { error } = await (supabase as any)
      .from("client_faturamento")
      .upsert({ client_id: clientId, ...patch }, { onConflict: "client_id" });
    if (error) {
      toast.error("Não salvou o faturamento", { description: error.message });
      throw error;
    }
    qc.invalidateQueries({ queryKey: ["client_faturamento", clientId] });
  };
  const autoCfg = useFormAutosave<Record<string, unknown>>(gravarCfg);
  // Escolha em select/switch grava quase na hora — não tem digitação pra esperar.
  const autoEscolha = useFormAutosave<Record<string, unknown>>(gravarCfg, { delay: 150 });

  // Tabela de preços: a linha inteira é substituída (mesma troca do botão antigo).
  const autoPrecos = useFormAutosave<{ precos: Preco[] }>(async ({ precos: lista = [] }) => {
    await (supabase as any).from("client_precos").delete().eq("client_id", clientId);
    const linhas = lista.filter((p) => p.tipo.trim()).map((p, i) => ({
      client_id: clientId, tipo: p.tipo.trim(), preco: Number(p.preco) || 0, ordem: i,
    }));
    if (linhas.length) {
      const { error } = await (supabase as any).from("client_precos").insert(linhas);
      if (error) {
        toast.error("Não salvou a tabela de preços", { description: error.message });
        throw error;
      }
    }
    qc.invalidateQueries({ queryKey: ["client_precos", clientId] });
  });

  // Contrato: mantém um ativo por cliente. Se ainda não existe, o primeiro
  // campo mexido cria a linha inteira — daí em diante só o campo mexido vai.
  const autoContrato = useFormAutosave<Record<string, unknown>>(async (patch) => {
    const erroDe = (error: any) => {
      toast.error("Não salvou o contrato", { description: error.message });
      throw error;
    };
    const atual = contratoIdRef.current ?? contratoDB?.id ?? null;
    if (atual) {
      const { error } = await (supabase as any).from("client_contratos").update(patch).eq("id", atual);
      if (error) erroDe(error);
    } else {
      const { data, error } = await (supabase as any).from("client_contratos").insert({
        client_id: clientId,
        nome: contrato.nome || "Contrato",
        valor_mensal: Number(contrato.valor_mensal) || 0,
        diarias_mes: Number(contrato.diarias_mes) || 0,
        entregas_mes: Number(contrato.entregas_mes) || 0,
        acumulo_meses: Number(contrato.acumulo_meses) || 1,
        valor_diaria_extra: Number(contrato.valor_diaria_extra) || 0,
        valor_entrega_extra: Number(contrato.valor_entrega_extra) || 0,
        inicio: contrato.inicio || null,
        ativo: true,
        ...patch,
      }).select("id").single();
      if (error) erroDe(error);
      contratoIdRef.current = data?.id ?? null;
    }
    qc.invalidateQueries({ queryKey: ["client_contratos", clientId] });
  });

  // Vários autosaves na mesma tela, um indicador só: erro na frente, depois "salvando".
  const estados: StatusSalvamento[] = [autoCfg.status, autoEscolha.status, autoPrecos.status, autoContrato.status];
  const status = estados.find((s) => s === "erro") ?? estados.find((s) => s !== "ocioso") ?? "ocioso";

  const setPrecosSalvando = (lista: Preco[]) => {
    setPrecos(lista);
    autoPrecos.agendar({ precos: lista });
  };

  async function gerarMes() {
    try {
      const ref = mesAnteriorISO();
      const { error } = await (supabase as any).rpc("gerar_faturamento_mensal", { _ref_mes: ref, _client: clientId, _apenas_auto: false });
      if (error) throw error;
      toast.success("Faturamento do mês anterior gerado. Abrindo…");
      navigate("/faturamento-mensal");
    } catch (e: any) {
      toast.error("Erro ao gerar: " + (e?.message || e));
    }
  }

  return (
    <Card className="bg-card border-border/50">
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Faturamento de {clientName}</h3>
            <p className="text-xs text-muted-foreground">Como esse cliente é cobrado — define o rascunho mensal automático.</p>
          </div>
          <IndicadorAutosave status={status} />
        </div>

        <div className="space-y-1.5">
          <Label>Modelo de cobrança</Label>
          <Select
            value={modelo}
            onValueChange={(v) => {
              setModelo(v as Modelo);
              autoEscolha.agendar({ modelo: v });
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MODELO_LABEL) as Modelo[]).map((m) => (
                <SelectItem key={m} value={m}>{MODELO_LABEL[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {modelo === "horas" && (
          <div className="space-y-1.5">
            <Label>Valor da hora (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={valorHora}
              onChange={(e) => {
                setValorHora(e.target.value);
                autoCfg.agendar({ valor_hora: Number(e.target.value) || 0 });
              }}
            />
            <p className="text-[11px] text-muted-foreground">Vale para horas de edição e de alteração — o relatório separa as duas.</p>
          </div>
        )}

        {modelo === "tabela" && (
          <div className="space-y-2">
            <Label>Tabela de preços por tipo de entrega</Label>
            {precos.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Tipo (ex.: Vídeo 15s, Reels)"
                  value={p.tipo}
                  onChange={(e) => setPrecosSalvando(precos.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}
                  className="flex-1"
                />
                <Input
                  type="number" step="0.01" placeholder="R$"
                  value={String(p.preco)}
                  onChange={(e) => setPrecosSalvando(precos.map((x, j) => (j === i ? { ...x, preco: Number(e.target.value) } : x)))}
                  className="w-28"
                />
                <button onClick={() => setPrecosSalvando(precos.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPrecos([...precos, { tipo: "", preco: 0, ordem: precos.length }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar tipo
            </Button>
            <p className="text-[11px] text-muted-foreground">O sistema casa cada entrega do mês com o tipo pelo formato/nome. Confira no rascunho gerado.</p>
          </div>
        )}

        {modelo === "contrato" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome do contrato</Label>
              <Input
                value={contrato.nome}
                onChange={(e) => {
                  setContrato({ ...contrato, nome: e.target.value });
                  autoContrato.agendar({ nome: e.target.value || "Contrato" });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor mensal (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={contrato.valor_mensal}
                onChange={(e) => {
                  setContrato({ ...contrato, valor_mensal: e.target.value });
                  autoContrato.agendar({ valor_mensal: Number(e.target.value) || 0 });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Acúmulo (meses)</Label>
              <Input
                type="number"
                value={contrato.acumulo_meses}
                onChange={(e) => {
                  setContrato({ ...contrato, acumulo_meses: e.target.value });
                  autoContrato.agendar({ acumulo_meses: Number(e.target.value) || 1 });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Diária extra (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={contrato.valor_diaria_extra}
                onChange={(e) => {
                  setContrato({ ...contrato, valor_diaria_extra: e.target.value });
                  autoContrato.agendar({ valor_diaria_extra: Number(e.target.value) || 0 });
                }}
              />
              <p className="text-[10px] text-muted-foreground">Cobrado por diária além da franquia.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Entrega extra (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={contrato.valor_entrega_extra}
                onChange={(e) => {
                  setContrato({ ...contrato, valor_entrega_extra: e.target.value });
                  autoContrato.agendar({ valor_entrega_extra: Number(e.target.value) || 0 });
                }}
              />
              <p className="text-[10px] text-muted-foreground">Cobrado por entrega além da franquia.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Diárias / mês</Label>
              <Input
                type="number"
                value={contrato.diarias_mes}
                onChange={(e) => {
                  setContrato({ ...contrato, diarias_mes: e.target.value });
                  autoContrato.agendar({ diarias_mes: Number(e.target.value) || 0 });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entregas / mês</Label>
              <Input
                type="number"
                value={contrato.entregas_mes}
                onChange={(e) => {
                  setContrato({ ...contrato, entregas_mes: e.target.value });
                  autoContrato.agendar({ entregas_mes: Number(e.target.value) || 0 });
                }}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Início do contrato</Label>
              <Input
                type="date"
                value={contrato.inicio}
                onChange={(e) => {
                  setContrato({ ...contrato, inicio: e.target.value });
                  // data vazia quebra o banco: vai como null.
                  autoContrato.agendar({ inicio: e.target.value || null });
                }}
              />
            </div>
          </div>
        )}

        {modelo !== "nenhum" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Margem (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={margem}
                  onChange={(e) => {
                    setMargem(e.target.value);
                    autoCfg.agendar({ margem_percent: Number(e.target.value) || 0 });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Imposto (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={imposto}
                  onChange={(e) => {
                    setImposto(e.target.value);
                    autoCfg.agendar({ imposto_percent: Number(e.target.value) || 0 });
                  }}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Conta: subtotal → + margem (sobre o subtotal) → + imposto (sobre subtotal+margem).</p>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 px-3 py-2">
              <span className="text-sm">Gerar rascunho automaticamente no dia 01</span>
              <Switch
                checked={autoMensal}
                onCheckedChange={(v) => {
                  setAutoMensal(v);
                  autoEscolha.agendar({ auto_mensal: v });
                }}
              />
            </label>
          </>
        )}

        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea
            rows={2}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              autoCfg.agendar({ observacoes: e.target.value || null });
            }}
            placeholder="Particularidades da cobrança deste cliente…"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {modelo !== "nenhum" && (
            <Button variant="outline" onClick={gerarMes}>
              <Sparkles className="mr-1.5 h-4 w-4" /> Gerar faturamento do mês anterior
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
