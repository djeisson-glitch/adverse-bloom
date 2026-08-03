import { useEffect, useRef, useState } from "react";
import { useVoltar } from "@/hooks/useVoltar";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";

interface Contexto {
  meta_faturamento_mensal: number | null;
  meta_margem_liquida: number | null;
  headcount: number | null;
  horas_produtivas_mes: number | null;
  estrutura: string | null;
  sazonalidade: string | null;
  prioridades: string | null;
  observacoes: string | null;
  saldo_inicial: number | null;
  saldo_inicial_data: string | null;
}

const EMPTY: Contexto = {
  meta_faturamento_mensal: null,
  meta_margem_liquida: null,
  headcount: null,
  horas_produtivas_mes: null,
  estrutura: "",
  sazonalidade: "",
  prioridades: "",
  observacoes: "",
  saldo_inicial: null,
  saldo_inicial_data: null,
};

export default function ConfiguracoesContexto() {
  const navigate = useNavigate();
  const voltar = useVoltar("/configuracoes");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Contexto>(EMPTY);

  const { data } = useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("empresa_contexto").select("*").eq("id", 1).maybeSingle();
      return data as Contexto | null;
    },
  });

  // É sempre a mesma linha (id=1), então carrega uma vez só: re-hidratar a cada
  // refetch (foco na janela, invalidação) apagaria o que está sendo digitado.
  const carregadoRef = useRef(false);
  useEffect(() => {
    if (!data || carregadoRef.current) return;
    carregadoRef.current = true;
    setForm({ ...EMPTY, ...data });
  }, [data]);

  // Salva ao digitar: só o campo mexido, ~0,8s depois da última tecla. Upsert
  // porque a linha pode ainda não existir no primeiro acesso.
  const auto = useFormAutosave<Record<string, unknown>>(async (patch) => {
    const { error } = await (supabase as any).from("empresa_contexto").upsert({
      id: 1,
      ...patch,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast({ title: "Não salvou", description: error.message, variant: "destructive" });
      throw error;
    }
    // Home e Fluxo de Caixa leem essa mesma linha (custo/hora, saldo âncora).
    qc.invalidateQueries({ queryKey: ["empresa_contexto"] });
  });

  const num = (v: string) => (v === "" ? null : Number(v));
  const set = (k: keyof Contexto, v: number | string | null) => {
    setForm((f) => ({ ...f, [k]: v }));
    auto.agendar({ [k]: v });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={voltar}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Contexto da Empresa
          </h1>
          <p className="text-sm text-muted-foreground">
            Quanto mais contexto, mais sob medida ficam as recomendações da IA financeira.
          </p>
        </div>
        <IndicadorAutosave status={auto.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Meta de faturamento mensal (R$)</Label>
            <Input type="number" value={form.meta_faturamento_mensal ?? ""} onChange={(e) => set("meta_faturamento_mensal", num(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Meta de margem líquida (%)</Label>
            <Input type="number" value={form.meta_margem_liquida ?? ""} onChange={(e) => set("meta_margem_liquida", num(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Headcount (pessoas)</Label>
            <Input type="number" value={form.headcount ?? ""} onChange={(e) => set("headcount", num(e.target.value))} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Horas produtivas/mês (equipe toda)</Label>
            <Input type="number" placeholder="Ex.: 4 pessoas × 160h × 70% produtivo ≈ 450" value={form.horas_produtivas_mes ?? ""} onChange={(e) => set("horas_produtivas_mes", num(e.target.value))} />
            <p className="text-xs text-muted-foreground">
              Usado pra calcular o <strong>custo hora</strong> na Home: custos fixos do mês ÷ estas horas. Conta só horas vendáveis/produtivas (desconta gestão, comercial, ociosidade).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Saldo em conta (âncora do fluxo de caixa)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Saldo real em conta (R$)</Label>
            <Input type="number" value={form.saldo_inicial ?? ""} onChange={(e) => set("saldo_inicial", num(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Na data</Label>
            <Input type="date" value={form.saldo_inicial_data ?? ""} onChange={(e) => set("saldo_inicial_data", e.target.value || null)} />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Some o saldo das suas contas no Conta Azul nessa data. O sistema calcula o saldo atual a partir daqui (recebido − pago), e o fluxo de caixa se ancora nele.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Como a operação funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Estrutura</Label>
            <Textarea rows={3} placeholder="Times fixos vs. freelas, sócios, terceirizados, áreas..." value={form.estrutura ?? ""} onChange={(e) => set("estrutura", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Sazonalidade</Label>
            <Textarea rows={2} placeholder="Meses fortes/fracos, picos de demanda..." value={form.sazonalidade ?? ""} onChange={(e) => set("sazonalidade", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Prioridades / estratégia atual</Label>
            <Textarea rows={2} placeholder="Crescer faturamento, melhorar margem, reduzir custo fixo..." value={form.prioridades ?? ""} onChange={(e) => set("prioridades", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={2} placeholder="Qualquer contexto extra que a IA deva considerar." value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
