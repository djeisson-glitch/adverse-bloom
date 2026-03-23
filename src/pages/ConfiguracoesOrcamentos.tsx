import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useBudgetSettings } from "@/hooks/useBudgets";
import { useTemplates, useDeleteTemplate } from "@/hooks/useTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface CommissionEntry {
  name: string;
  percent: number;
  enabled: boolean;
}

export default function ConfiguracoesOrcamentos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useBudgetSettings();
  const { data: templates = [] } = useTemplates();
  const deleteTemplate = useDeleteTemplate();

  const [markup, setMarkup] = useState("35");
  const [tax, setTax] = useState("9.5");
  const [bv, setBv] = useState("0");
  const [commissions, setCommissions] = useState<CommissionEntry[]>([
    { name: "Djeisson", percent: 3, enabled: true },
    { name: "Robert", percent: 3, enabled: true },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setMarkup(String(settings.markup_default));
      setTax(String(settings.tax_default));
      setBv(String(settings.commission_default));
      setCommissions([
        { name: "Djeisson", percent: settings.commission_djeisson_percent, enabled: settings.commission_djeisson_enabled },
        { name: "Robert", percent: settings.commission_robert_percent, enabled: settings.commission_robert_enabled },
      ]);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("budget_settings")
        .update({
          markup_default: parseFloat(markup) || 35,
          tax_default: parseFloat(tax) || 9.5,
          commission_default: parseFloat(bv) || 0,
          commission_djeisson_percent: commissions[0]?.percent || 3,
          commission_djeisson_enabled: commissions[0]?.enabled ?? true,
          commission_robert_percent: commissions[1]?.percent || 3,
          commission_robert_enabled: commissions[1]?.enabled ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["budget_settings"] });
      toast({ title: "Configurações de orçamento salvas" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Markup, impostos, comissões e templates</p>
        </div>
      </motion.div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Valores padrão</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Markup (%)</Label>
              <Input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} />
            </div>
            <div>
              <Label>Imposto (%)</Label>
              <Input type="number" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <div>
              <Label>BV (%)</Label>
              <Input type="number" value={bv} onChange={(e) => setBv(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Comissão por sócio</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {commissions.map((c, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <Input value={c.name} onChange={(e) => {
                const u = [...commissions];
                u[idx] = { ...u[idx], name: e.target.value };
                setCommissions(u);
              }} className="flex-1" />
              <div className="flex items-center gap-2">
                <Input type="number" value={c.percent} onChange={(e) => {
                  const u = [...commissions];
                  u[idx] = { ...u[idx], percent: parseFloat(e.target.value) || 0 };
                  setCommissions(u);
                }} className="w-20" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Templates de orçamento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum template criado ainda</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{t.description || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteTemplate.mutate(t.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Salvando..." : "Salvar alterações"}
      </Button>
    </div>
  );
}
