import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Brain, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Contexto {
  meta_faturamento_mensal: number | null;
  meta_margem_liquida: number | null;
  headcount: number | null;
  estrutura: string | null;
  sazonalidade: string | null;
  prioridades: string | null;
  observacoes: string | null;
}

const EMPTY: Contexto = {
  meta_faturamento_mensal: null,
  meta_margem_liquida: null,
  headcount: null,
  estrutura: "",
  sazonalidade: "",
  prioridades: "",
  observacoes: "",
};

export default function ConfiguracoesContexto() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<Contexto>(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("empresa_contexto").select("*").eq("id", 1).maybeSingle();
      return data as Contexto | null;
    },
  });

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data });
  }, [data]);

  const num = (v: string) => (v === "" ? null : Number(v));
  const set = (k: keyof Contexto, v: number | string | null) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await (supabase as any).from("empresa_contexto").upsert({
      id: 1,
      ...form,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else toast({ title: "Contexto salvo", description: "A IA vai usar isso nas próximas análises." });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Contexto da Empresa
          </h1>
          <p className="text-sm text-muted-foreground">
            Quanto mais contexto, mais sob medida ficam as recomendações da IA financeira.
          </p>
        </div>
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

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar contexto"}
      </Button>
    </div>
  );
}
