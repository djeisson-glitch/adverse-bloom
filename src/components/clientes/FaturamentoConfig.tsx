import { useState, useEffect } from "react";
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
import { Plus, Trash2, Save, Sparkles } from "lucide-react";

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

  const { data: cfg } = useQuery({
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
  const [contrato, setContrato] = useState({ nome: "Contrato", valor_mensal: "0", diarias_mes: "0", entregas_mes: "0", acumulo_meses: "2", inicio: "" });
  const [salvando, setSalvando] = useState(false);

  // Semeia o formulário quando os dados chegam (config pode não existir ainda).
  useEffect(() => {
    if (cfg) {
      setModelo((cfg.modelo as Modelo) || "nenhum");
      setValorHora(String(cfg.valor_hora ?? 0));
      setImposto(String(cfg.imposto_percent ?? 0));
      setMargem(String(cfg.margem_percent ?? 0));
      setAutoMensal(cfg.auto_mensal ?? true);
      setObs(cfg.observacoes || "");
    }
  }, [cfg]);
  useEffect(() => { if (precosDB) setPrecos(precosDB); }, [precosDB]);
  useEffect(() => {
    if (contratoDB) setContrato({
      nome: contratoDB.nome || "Contrato",
      valor_mensal: String(contratoDB.valor_mensal ?? 0),
      diarias_mes: String(contratoDB.diarias_mes ?? 0),
      entregas_mes: String(contratoDB.entregas_mes ?? 0),
      acumulo_meses: String(contratoDB.acumulo_meses ?? 2),
      inicio: contratoDB.inicio || "",
    });
  }, [contratoDB]);

  async function salvar() {
    setSalvando(true);
    try {
      const { error: e1 } = await (supabase as any).from("client_faturamento").upsert({
        client_id: clientId,
        modelo,
        valor_hora: Number(valorHora) || 0,
        imposto_percent: Number(imposto) || 0,
        margem_percent: Number(margem) || 0,
        auto_mensal: autoMensal,
        observacoes: obs || null,
      });
      if (e1) throw e1;

      if (modelo === "tabela") {
        await (supabase as any).from("client_precos").delete().eq("client_id", clientId);
        const linhas = precos.filter((p) => p.tipo.trim()).map((p, i) => ({
          client_id: clientId, tipo: p.tipo.trim(), preco: Number(p.preco) || 0, ordem: i,
        }));
        if (linhas.length) {
          const { error: e2 } = await (supabase as any).from("client_precos").insert(linhas);
          if (e2) throw e2;
        }
      }

      if (modelo === "contrato") {
        // mantém um contrato ativo por cliente (desativa os antigos, insere/atualiza o atual)
        const payload = {
          client_id: clientId,
          nome: contrato.nome || "Contrato",
          valor_mensal: Number(contrato.valor_mensal) || 0,
          diarias_mes: Number(contrato.diarias_mes) || 0,
          entregas_mes: Number(contrato.entregas_mes) || 0,
          acumulo_meses: Number(contrato.acumulo_meses) || 1,
          inicio: contrato.inicio || null,
          ativo: true,
        };
        if (contratoDB?.id) {
          const { error: e3 } = await (supabase as any).from("client_contratos").update(payload).eq("id", contratoDB.id);
          if (e3) throw e3;
        } else {
          const { error: e3 } = await (supabase as any).from("client_contratos").insert(payload);
          if (e3) throw e3;
        }
      }

      qc.invalidateQueries({ queryKey: ["client_faturamento", clientId] });
      qc.invalidateQueries({ queryKey: ["client_precos", clientId] });
      qc.invalidateQueries({ queryKey: ["client_contratos", clientId] });
      toast.success("Faturamento do cliente salvo.");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || e));
    } finally {
      setSalvando(false);
    }
  }

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
        </div>

        <div className="space-y-1.5">
          <Label>Modelo de cobrança</Label>
          <Select value={modelo} onValueChange={(v) => setModelo(v as Modelo)}>
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
            <Input type="number" step="0.01" value={valorHora} onChange={(e) => setValorHora(e.target.value)} />
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
                  onChange={(e) => setPrecos((arr) => arr.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}
                  className="flex-1"
                />
                <Input
                  type="number" step="0.01" placeholder="R$"
                  value={String(p.preco)}
                  onChange={(e) => setPrecos((arr) => arr.map((x, j) => (j === i ? { ...x, preco: Number(e.target.value) } : x)))}
                  className="w-28"
                />
                <button onClick={() => setPrecos((arr) => arr.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPrecos((arr) => [...arr, { tipo: "", preco: 0, ordem: arr.length }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar tipo
            </Button>
            <p className="text-[11px] text-muted-foreground">O sistema casa cada entrega do mês com o tipo pelo formato/nome. Confira no rascunho gerado.</p>
          </div>
        )}

        {modelo === "contrato" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome do contrato</Label>
              <Input value={contrato.nome} onChange={(e) => setContrato({ ...contrato, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor mensal (R$)</Label>
              <Input type="number" step="0.01" value={contrato.valor_mensal} onChange={(e) => setContrato({ ...contrato, valor_mensal: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Acúmulo (meses)</Label>
              <Input type="number" value={contrato.acumulo_meses} onChange={(e) => setContrato({ ...contrato, acumulo_meses: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Diárias / mês</Label>
              <Input type="number" value={contrato.diarias_mes} onChange={(e) => setContrato({ ...contrato, diarias_mes: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Entregas / mês</Label>
              <Input type="number" value={contrato.entregas_mes} onChange={(e) => setContrato({ ...contrato, entregas_mes: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Início do contrato</Label>
              <Input type="date" value={contrato.inicio} onChange={(e) => setContrato({ ...contrato, inicio: e.target.value })} />
            </div>
          </div>
        )}

        {modelo !== "nenhum" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Margem (%)</Label>
                <Input type="number" step="0.01" value={margem} onChange={(e) => setMargem(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Imposto (%)</Label>
                <Input type="number" step="0.01" value={imposto} onChange={(e) => setImposto(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Conta: subtotal → + margem (sobre o subtotal) → + imposto (sobre subtotal+margem).</p>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 px-3 py-2">
              <span className="text-sm">Gerar rascunho automaticamente no dia 01</span>
              <Switch checked={autoMensal} onCheckedChange={setAutoMensal} />
            </label>
          </>
        )}

        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Particularidades da cobrança deste cliente…" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={salvar} disabled={salvando}>
            <Save className="mr-1.5 h-4 w-4" /> {salvando ? "Salvando…" : "Salvar"}
          </Button>
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
