import { useState, useEffect, useRef } from "react";
import { useVoltar } from "@/hooks/useVoltar";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCommercialSettings, type PipelineStage } from "@/hooks/useCommercialSettings";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { useNavigate } from "react-router-dom";

export default function ConfiguracoesComercial() {
  const { settings, isLoading, updateSettings } = useCommercialSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const voltar = useVoltar("/configuracoes");

  const [monthlyTarget, setMonthlyTarget] = useState("200000");
  const [followupWon, setFollowupWon] = useState("180");
  const [followupLost, setFollowupLost] = useState("60");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [lossReasons, setLossReasons] = useState<string[]>([]);

  // Re-hidrata só quando muda a LINHA — cada gravação invalida a query e traz
  // `settings` novo; seguir isso apagaria o que a pessoa está digitando.
  const carregadoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!settings || carregadoRef.current === settings.id) return;
    carregadoRef.current = settings.id;
    setMonthlyTarget(String(settings.monthly_target));
    setFollowupWon(String(settings.followup_won_days));
    setFollowupLost(String(settings.followup_lost_days));
    setStages(settings.pipeline_stages || []);
    setLossReasons(settings.loss_reasons || []);
  }, [settings]);

  // Salva ao digitar: manda só o campo mexido, ~0,8s depois da última tecla.
  const auto = useFormAutosave<Record<string, unknown>>(async (patch) => {
    try {
      await updateSettings.mutateAsync(patch as any);
    } catch (err: any) {
      toast({ title: "Não salvou", description: err.message, variant: "destructive" });
      throw err;
    }
  });

  // Botão de adicionar/remover não é digitação — não tem o que esperar.
  const gravarJa = (patch: Record<string, unknown>) => {
    auto.agendar(patch);
    void auto.gravarAgora();
  };

  // Campo numérico vazio (ou meio digitado) não vai pro banco: quem apaga pra
  // redigitar não pode ver a meta virar 0 no meio do caminho.
  const setNumero = (campo: string, valor: string, set: (v: string) => void) => {
    set(valor);
    const n = Number(valor);
    if (valor.trim() !== "" && Number.isFinite(n)) auto.agendar({ [campo]: n });
  };

  const addStage = () => {
    const novos = [...stages, { id: `stage_${Date.now()}`, label: "Novo estágio", color: "#6b7280" }];
    setStages(novos);
    gravarJa({ pipeline_stages: novos });
  };

  const removeStage = (idx: number) => {
    const novos = stages.filter((_, i) => i !== idx);
    setStages(novos);
    gravarJa({ pipeline_stages: novos });
  };

  const updateStage = (idx: number, field: keyof PipelineStage, value: string) => {
    const updated = [...stages];
    updated[idx] = { ...updated[idx], [field]: value };
    setStages(updated);
    auto.agendar({ pipeline_stages: updated });
  };

  const addReason = () => {
    const novos = [...lossReasons, ""];
    setLossReasons(novos);
    gravarJa({ loss_reasons: novos });
  };
  const removeReason = (idx: number) => {
    const novos = lossReasons.filter((_, i) => i !== idx);
    setLossReasons(novos);
    gravarJa({ loss_reasons: novos });
  };
  const updateReason = (idx: number, value: string) => {
    const updated = [...lossReasons];
    updated[idx] = value;
    setLossReasons(updated);
    auto.agendar({ loss_reasons: updated });
  };

  if (isLoading) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={voltar}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Configurações do Comercial</h1>
          <p className="text-sm text-muted-foreground">Pipeline, metas e follow-ups</p>
        </div>
        <IndicadorAutosave status={auto.status} />
      </motion.div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Metas e prazos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Meta mensal (R$)</Label>
            <Input
              type="number"
              value={monthlyTarget}
              onChange={(e) => setNumero("monthly_target", e.target.value, setMonthlyTarget)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Follow-up pós-ganho (dias)</Label>
              <Input
                type="number"
                value={followupWon}
                onChange={(e) => setNumero("followup_won_days", e.target.value, setFollowupWon)}
              />
            </div>
            <div>
              <Label>Follow-up pós-perda (dias)</Label>
              <Input
                type="number"
                value={followupLost}
                onChange={(e) => setNumero("followup_lost_days", e.target.value, setFollowupLost)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Estágios do pipeline</CardTitle>
          <Button variant="outline" size="sm" onClick={addStage}><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {stages.map((stage, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input value={stage.label} onChange={(e) => updateStage(idx, "label", e.target.value)} className="flex-1" />
              <Input type="color" value={stage.color} onChange={(e) => updateStage(idx, "color", e.target.value)} className="w-12 h-9 p-1 cursor-pointer" />
              <Button variant="ghost" size="icon" onClick={() => removeStage(idx)} className="shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Motivos de perda</CardTitle>
          <Button variant="outline" size="sm" onClick={addReason}><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {lossReasons.map((reason, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input value={reason} onChange={(e) => updateReason(idx, e.target.value)} className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => removeReason(idx)} className="shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
