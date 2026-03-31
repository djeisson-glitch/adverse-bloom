import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useBudgetSettings } from "@/hooks/useBudgets";
import { useTemplates, useDeleteTemplate } from "@/hooks/useTemplates";
import { usePresetItems, useSavePresetItem, useDeletePresetItem } from "@/hooks/usePresetItems";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";

interface CommissionEntry {
  name: string;
  percent: number;
  enabled: boolean;
}

const CATEGORIES = ["PRODUÇÃO", "PÓS-PRODUÇÃO", "LOGÍSTICA"];

export default function ConfiguracoesOrcamentos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useBudgetSettings();
  const { data: templates = [] } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const { data: presetItems = [] } = usePresetItems();
  const savePresetItem = useSavePresetItem();
  const deletePresetItem = useDeletePresetItem();

  const [markup, setMarkup] = useState("35");
  const [tax, setTax] = useState("9.5");
  const [bv, setBv] = useState("0");
  const [commissions, setCommissions] = useState<CommissionEntry[]>([
    { name: "Djeisson", percent: 3, enabled: true },
    { name: "Robert", percent: 3, enabled: true },
  ]);
  const [saving, setSaving] = useState(false);

  // New preset item form
  const [newPreset, setNewPreset] = useState({
    category: "PRODUÇÃO",
    item_name: "",
    client_unit_price: 0,
    has_supplier_cost: false,
    supplier_unit_price: 0,
  });

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
    setSaving(true);
    try {
      const payload = {
        markup_default: parseFloat(markup) || 35,
        tax_default: parseFloat(tax) || 9.5,
        commission_default: parseFloat(bv) || 0,
        commission_djeisson_percent: commissions[0]?.percent || 3,
        commission_djeisson_enabled: commissions[0]?.enabled ?? true,
        commission_robert_percent: commissions[1]?.percent || 3,
        commission_robert_enabled: commissions[1]?.enabled ?? true,
        updated_at: new Date().toISOString(),
      };
      let error;
      if (settings?.id) {
        ({ error } = await supabase
          .from("budget_settings")
          .update(payload)
          .eq("id", settings.id));
      } else {
        ({ error } = await supabase
          .from("budget_settings")
          .insert(payload));
      }
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["budget_settings"] });
      toast({ title: "Configurações de orçamento salvas" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddPreset = () => {
    if (!newPreset.item_name.trim()) {
      toast({ title: "Nome do item é obrigatório", variant: "destructive" });
      return;
    }
    savePresetItem.mutate({
      category: newPreset.category,
      item_name: newPreset.item_name.trim(),
      client_days: 1,
      client_people: 1,
      client_unit_price: newPreset.client_unit_price,
      has_supplier_cost: newPreset.has_supplier_cost,
      supplier_days: 1,
      supplier_people: 1,
      supplier_unit_price: newPreset.supplier_unit_price,
    }, {
      onSuccess: () => {
        setNewPreset({ category: "PRODUÇÃO", item_name: "", client_unit_price: 0, has_supplier_cost: false, supplier_unit_price: 0 });
      },
    });
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
          <p className="text-sm text-muted-foreground">Markup, impostos, comissões, templates e itens pré-cadastrados</p>
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

      {/* Preset Items */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Itens pré-cadastrados</CardTitle>
          <p className="text-xs text-muted-foreground">Itens reutilizáveis com valores padrão para agilizar a criação de orçamentos</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new preset */}
          <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={newPreset.category} onValueChange={(v) => setNewPreset({ ...newPreset, category: v })}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs">Nome do item</Label>
              <Input value={newPreset.item_name} onChange={(e) => setNewPreset({ ...newPreset, item_name: e.target.value })} placeholder="Ex: Operador de Câmera" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor cliente</Label>
              <Input type="number" value={newPreset.client_unit_price || ""} onChange={(e) => setNewPreset({ ...newPreset, client_unit_price: Number(e.target.value) || 0 })} className="h-8 text-sm w-24" placeholder="R$" />
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Checkbox checked={newPreset.has_supplier_cost} onCheckedChange={(c) => setNewPreset({ ...newPreset, has_supplier_cost: !!c })} className="h-3.5 w-3.5" />
              <span className="text-xs text-muted-foreground">Fornecedor</span>
            </div>
            {newPreset.has_supplier_cost && (
              <div className="space-y-1">
                <Label className="text-xs">Custo forn.</Label>
                <Input type="number" value={newPreset.supplier_unit_price || ""} onChange={(e) => setNewPreset({ ...newPreset, supplier_unit_price: Number(e.target.value) || 0 })} className="h-8 text-sm w-24" placeholder="R$" />
              </div>
            )}
            <Button size="sm" onClick={handleAddPreset} disabled={savePresetItem.isPending} className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>

          {/* Existing presets */}
          {presetItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">Nenhum item pré-cadastrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Valor Cliente</TableHead>
                  <TableHead className="text-right">Custo Forn.</TableHead>
                  <TableHead className="w-[60px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presetItems.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs"><span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{p.category}</span></TableCell>
                    <TableCell className="font-medium text-sm">{p.item_name}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(p.client_unit_price)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{p.has_supplier_cost ? formatCurrency(p.supplier_unit_price) : "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deletePresetItem.mutate(p.id)} className="text-muted-foreground hover:text-destructive h-7 w-7">
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
