import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";
import { useSaveTemplate } from "@/hooks/useTemplates";
import type { BudgetItem } from "@/hooks/useBudgets";

interface Props {
  open: boolean;
  onClose: () => void;
  items: BudgetItem[];
  markupPercent: number;
  taxPercent: number;
  commissionPercent: number;
  bvPercent: number;
  notIncluded: string[];
}

export function SaveTemplateModal({ open, onClose, items, markupPercent, taxPercent, commissionPercent, bvPercent, notIncluded }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const saveTemplate = useSaveTemplate();

  const handleSave = () => {
    const categories = items
      .filter((i) => i.item_name.trim())
      .map((i) => ({
        category: i.category,
        item_name: i.item_name,
        client_days: i.client_days,
        client_people: i.client_people,
        client_unit_price: i.client_unit_price,
        has_supplier_cost: i.has_supplier_cost,
        supplier_days: i.supplier_days,
        supplier_people: i.supplier_people,
        supplier_unit_price: i.supplier_unit_price,
      }));

    saveTemplate.mutate(
      {
        name,
        description: description || null,
        categories,
        markup_default: markupPercent,
        tax_default: taxPercent,
        commission_default: commissionPercent,
        bv_default: bvPercent,
        not_included: notIncluded,
        created_by: null,
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            Salvar como Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Nome do template</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Filme institucional" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição do escopo padrão..." className="text-sm resize-none" rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">
            {items.filter((i) => i.item_name.trim()).length} itens • Markup {markupPercent}% • Imposto {taxPercent}%
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saveTemplate.isPending}>
            <Save className="mr-2 h-4 w-4" /> Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
