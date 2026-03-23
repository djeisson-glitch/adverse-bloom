import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, GripVertical, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCommercialSettings, type PipelineStage } from "@/hooks/useCommercialSettings";
import { useNavigate } from "react-router-dom";

export default function ConfiguracoesComercial() {
  const { settings, isLoading, updateSettings } = useCommercialSettings();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [monthlyTarget, setMonthlyTarget] = useState("200000");
  const [followupWon, setFollowupWon] = useState("180");
  const [followupLost, setFollowupLost] = useState("60");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [lossReasons, setLossReasons] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setMonthlyTarget(String(settings.monthly_target));
      setFollowupWon(String(settings.followup_won_days));
      setFollowupLost(String(settings.followup_lost_days));
      setStages(settings.pipeline_stages || []);
      setLossReasons(settings.loss_reasons || []);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        monthly_target: parseFloat(monthlyTarget) || 200000,
        followup_won_days: parseInt(followupWon) || 180,
        followup_lost_days: parseInt(followupLost) || 60,
        pipeline_stages: stages as any,
        loss_reasons: lossReasons as any,
      });
      toast({ title: "Configurações salvas" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addStage = () => {
    setStages([...stages, { id: `stage_${Date.now()}`, label: "Novo estágio", color: "#6b7280" }]);
  };

  const removeStage = (idx: number) => {
    setStages(stages.filter((_, i) => i !== idx));
  };

  const updateStage = (idx: number, field: keyof PipelineStage, value: string) => {
    const updated = [...stages];
    updated[idx] = { ...updated[idx], [field]: value };
    setStages(updated);
  };

  const addReason = () => setLossReasons([...lossReasons, ""]);
  const removeReason = (idx: number) => setLossReasons(lossReasons.filter((_, i) => i !== idx));
  const updateReason = (idx: number, value: string) => {
    const updated = [...lossReasons];
    updated[idx] = value;
    setLossReasons(updated);
  };

  if (isLoading) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Configurações do Comercial</h1>
          <p className="text-sm text-muted-foreground">Pipeline, metas e follow-ups</p>
        </div>
      </motion.div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Metas e prazos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Meta mensal (R$)</Label>
            <Input type="number" value={monthlyTarget} onChange={(e) => setMonthlyTarget(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Follow-up pós-ganho (dias)</Label>
              <Input type="number" value={followupWon} onChange={(e) => setFollowupWon(e.target.value)} />
            </div>
            <div>
              <Label>Follow-up pós-perda (dias)</Label>
              <Input type="number" value={followupLost} onChange={(e) => setFollowupLost(e.target.value)} />
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

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Salvando..." : "Salvar configurações"}
      </Button>
    </div>
  );
}
