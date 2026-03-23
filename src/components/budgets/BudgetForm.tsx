import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, Check, Copy, History, ChevronDown, ChevronRight, Save, Link, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { calcBudgetTotals } from "@/lib/budgetCalc";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDeals, useClients } from "@/hooks/useDeals";
import { useSupplierContacts } from "@/hooks/useSupplierContacts";
import { ClientSelect } from "@/components/clientes/ClientSelect";
import { ApprovalModal } from "./ApprovalModal";
import { SaveTemplateModal } from "./SaveTemplateModal";
import { NewVersionModal } from "./NewVersionModal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useBudgetWithItems,
  useSaveBudget,
  useBudgetSettings,
  useCreateNewVersion,
  useBudgetVersions,
  type BudgetItem,
} from "@/hooks/useBudgets";

const DEFAULT_CATEGORIES = ["PRODUÇÃO", "PÓS-PRODUÇÃO", "LOGÍSTICA"];
const BV_OPTIONS = [0, 10, 15, 20];

const DEFAULT_NOT_INCLUDED = [
  "Locações externas não previstas",
  "Alimentação da equipe do cliente",
  "Ajustes após aprovação final",
];

/* ── Category Config ── */
interface CategoryFieldConfig {
  field1: string;
  field2: string | null;
  field3: string;
  formula: string;
}

const categoryConfig: Record<string, CategoryFieldConfig> = {
  "PRODUÇÃO": { field1: "Dias", field2: "Pessoas", field3: "Valor/diária", formula: "dias × pessoas × valor" },
  "PÓS-PRODUÇÃO": { field1: "Horas", field2: null, field3: "Valor/hora", formula: "horas × valor" },
  "LOGÍSTICA": { field1: "Dias", field2: "Pessoas", field3: "Valor/dia", formula: "dias × pessoas × valor" },
};

const LOGISTICA_NEEDS_PEOPLE = ["alimentação", "café", "lanche", "jantar", "almoço", "refeição", "hotel", "hospedagem", "pousada", "airbnb"];

function logisticaNeedsPeople(itemName: string): boolean {
  const lower = itemName.toLowerCase().trim();
  return LOGISTICA_NEEDS_PEOPLE.some((kw) => lower.includes(kw));
}

const POS_ENTREGA_KEYWORDS = [
  "locução", "trilha", "música", "narração", "legendagem", "tradução",
  "cachê", "direitos", "licença", "editor",
  "entrega", "vídeo", "video", "versão", "versao",
  "formato", "saída", "saida", "renderização", "render",
];
const POS_HORAS_KEYWORDS = [
  "edição", "edicao", "color", "grading", "motion",
  "animação", "animacao", "correção", "correcao",
  "mixagem", "finalização", "finalizacao", "tratamento", "vfx",
];

function posIsEntrega(itemName: string): boolean {
  const lower = itemName.toLowerCase().trim();
  if (POS_HORAS_KEYWORDS.some((kw) => lower.includes(kw))) return false;
  if (POS_ENTREGA_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return false;
}

function getCatConfig(cat: string, itemName?: string): CategoryFieldConfig {
  const base = categoryConfig[cat] ?? categoryConfig["PRODUÇÃO"];
  if (cat === "LOGÍSTICA" && itemName && !logisticaNeedsPeople(itemName)) {
    return { ...base, field2: null, formula: "dias × valor" };
  }
  return base;
}

function emptyItem(category: string, orderIndex: number): BudgetItem {
  return {
    category,
    item_name: "",
    client_days: 1,
    client_people: 1,
    client_unit_price: 0,
    client_price: 0,
    has_supplier_cost: false,
    supplier_days: 0,
    supplier_people: 0,
    supplier_unit_price: 0,
    supplier_cost: 0,
    margin_value: 0,
    margin_percent: 0,
    order_index: orderIndex,
  };
}

interface Props {
  budgetId: string | null;
  onClose: () => void;
  onOpenVersion?: (id: string) => void;
  initialDealId?: string | null;
}

/** Numeric input that strips leading zeros */
function NumInput({
  value,
  onChange,
  className: cn = "",
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <Input
      type="number"
      value={value || ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? 0 : Number(raw));
      }}
      className={cn}
      {...rest}
    />
  );
}

export function BudgetForm({ budgetId, onClose, onOpenVersion, initialDealId }: Props) {
  const { data: existing } = useBudgetWithItems(budgetId);
  const { data: settings } = useBudgetSettings();
  const saveBudget = useSaveBudget();
  const createNewVersion = useCreateNewVersion();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const { data: versions = [] } = useBudgetVersions(existing?.budget_number ?? null);
  const { deals } = useDeals();
  const { data: supplierContacts = [] } = useSupplierContacts();
  

  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [markupPercent, setMarkupPercent] = useState(35);
  const [taxPercent, setTaxPercent] = useState(9.5);
  const [bvPercent, setBvPercent] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(4);
  const [discount, setDiscount] = useState(0);
  const [addition, setAddition] = useState(0);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [dealId, setDealId] = useState<string | null>(initialDealId ?? null);
  const [notIncluded, setNotIncluded] = useState<string[]>(DEFAULT_NOT_INCLUDED);

  // Commission split
  const [djEnabled, setDjEnabled] = useState(true);
  const [djPercent, setDjPercent] = useState(3);
  const [robertEnabled, setRobertEnabled] = useState(true);
  const [robertPercent, setRobertPercent] = useState(3);

  // Track which rows are "new" (inline add)
  const [newRowCats, setNewRowCats] = useState<Set<string>>(new Set());
  const newRowNameRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Modals
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [notIncludedOpen, setNotIncludedOpen] = useState(true);

  useEffect(() => {
    if (existing) {
      setProjectName(existing.project_name);
      setClientName(existing.client_name);
      setMarkupPercent(existing.markup_percent);
      setTaxPercent(existing.tax_percent);
      setBvPercent(existing.bv_percent);
      setCommissionPercent(existing.commission_percent);
      setDiscount(existing.discount);
      setAddition(existing.addition);
      setItems(existing.budget_items || []);
      setDealId((existing as any).deal_id ?? null);
      setNotIncluded((existing as any).not_included ?? []);
      const cats = [...new Set((existing.budget_items || []).map((i) => i.category))];
      if (cats.length > 0) {
        setCategories([...new Set([...DEFAULT_CATEGORIES, ...cats])]);
      }
    } else if (settings) {
      setMarkupPercent(settings.markup_default);
      setTaxPercent(settings.tax_default);
      setCommissionPercent(settings.commission_default);
      if ('commission_djeisson_percent' in settings) {
        setDjPercent((settings as any).commission_djeisson_percent ?? 3);
        setRobertPercent((settings as any).commission_robert_percent ?? 3);
        setDjEnabled((settings as any).commission_djeisson_enabled ?? true);
        setRobertEnabled((settings as any).commission_robert_enabled ?? true);
      }
    }
  }, [existing, settings]);

  // Handle deal selection: auto-fill client and project name
  useEffect(() => {
    if (dealId && !budgetId) {
      const deal = deals.find((d) => d.id === dealId);
      if (deal) {
        if (!clientName || clientName === "") {
          setClientName(deal.client?.name || "");
        }
        if (!projectName || projectName === "") {
          setProjectName(deal.title);
        }
      }
    }
  }, [dealId, deals, budgetId]);

  // Auto-calc commission from split
  useEffect(() => {
    const total = (djEnabled ? djPercent : 0) + (robertEnabled ? robertPercent : 0);
    setCommissionPercent(total);
  }, [djEnabled, djPercent, robertEnabled, robertPercent]);

  const totals = useMemo(
    () => calcBudgetTotals(items, markupPercent, taxPercent, bvPercent, commissionPercent, discount, addition),
    [items, markupPercent, taxPercent, bvPercent, commissionPercent, discount, addition]
  );

  const recalcItem = (item: BudgetItem, cat?: string): BudgetItem => {
    const category = cat || item.category;
    const config = getCatConfig(category, item.item_name);
    const cp = config.field2
      ? item.client_days * item.client_people * item.client_unit_price
      : item.client_days * item.client_unit_price;
    const sc = item.has_supplier_cost
      ? (config.field2
          ? item.supplier_days * item.supplier_people * item.supplier_unit_price
          : item.supplier_days * item.supplier_unit_price)
      : 0;
    return {
      ...item,
      client_price: cp,
      supplier_cost: sc,
      supplier_days: item.has_supplier_cost ? item.supplier_days : 0,
      supplier_people: item.has_supplier_cost ? item.supplier_people : 0,
      supplier_unit_price: item.has_supplier_cost ? item.supplier_unit_price : 0,
      margin_value: cp - sc,
      margin_percent: cp > 0 ? ((cp - sc) / cp) * 100 : 0,
    };
  };

  const updateItem = (index: number, field: keyof BudgetItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const updated = { ...copy[index], [field]: value };
      copy[index] = recalcItem(updated);
      return copy;
    });
  };

  const toggleSupplier = (index: number, checked: boolean) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], has_supplier_cost: checked };
      if (!checked) {
        item.supplier_days = 0;
        item.supplier_people = 0;
        item.supplier_unit_price = 0;
      }
      copy[index] = recalcItem(item);
      return copy;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addCategory = () => {
    const cat = newCategory.trim().toUpperCase();
    if (cat && !categories.includes(cat)) {
      setCategories((prev) => [...prev, cat]);
      setNewCategory("");
    }
  };

  const addInlineRow = useCallback((cat: string) => {
    if (newRowCats.has(cat)) return;
    const newItem = emptyItem(cat, items.length);
    setItems((prev) => [...prev, newItem]);
    setNewRowCats((prev) => new Set(prev).add(cat));
    setTimeout(() => {
      newRowNameRefs.current[cat]?.focus();
    }, 50);
  }, [items.length, newRowCats]);

  const confirmInlineRow = useCallback((cat: string) => {
    setNewRowCats((prev) => {
      const next = new Set(prev);
      next.delete(cat);
      return next;
    });
  }, []);

  const cancelInlineRow = useCallback((cat: string) => {
    setItems((prev) => {
      const lastIdx = [...prev].reverse().findIndex(
        (item) => item.category === cat && !item.item_name.trim()
      );
      if (lastIdx === -1) return prev;
      const realIdx = prev.length - 1 - lastIdx;
      return prev.filter((_, i) => i !== realIdx);
    });
    setNewRowCats((prev) => {
      const next = new Set(prev);
      next.delete(cat);
      return next;
    });
  }, []);

  // Resumo de Entregas
  const resumoEntregas = useMemo(() => {
    const validItems = items.filter((i) => i.item_name.trim());
    const producaoItems: { nome: string; qtd: number; dias: number }[] = [];
    validItems.filter((i) => i.category === "PRODUÇÃO").forEach((item) => {
      const key = item.item_name.toLowerCase().trim();
      const existing = producaoItems.find((r) => r.nome.toLowerCase() === key);
      const diarias = item.client_days * item.client_people;
      if (existing) {
        existing.qtd += item.client_people;
        existing.dias += diarias;
      } else {
        producaoItems.push({ nome: item.item_name, qtd: item.client_people, dias: diarias });
      }
    });

    const posHorasItems: { nome: string; horas: number }[] = [];
    const posEntregaItems: { nome: string; qtd: number }[] = [];
    validItems
      .filter((i) => i.category === "PÓS-PRODUÇÃO")
      .forEach((item) => {
        if (posIsEntrega(item.item_name)) {
          posEntregaItems.push({ nome: item.item_name, qtd: item.client_days });
        } else {
          posHorasItems.push({ nome: item.item_name, horas: item.client_days });
        }
      });

    const logItems = validItems
      .filter((i) => i.category === "LOGÍSTICA")
      .map((item) => {
        const needsPeople = logisticaNeedsPeople(item.item_name);
        return {
          nome: item.item_name,
          dias: item.client_days,
          pessoas: needsPeople ? item.client_people : null,
        };
      });

    const prodItems = validItems.filter((i) => i.category === "PRODUÇÃO");
    const totalProducaoDias = prodItems.length > 0 ? Math.max(...prodItems.map((i) => i.client_days)) : 0;
    const totalProducaoPessoas = prodItems.reduce((s, i) => s + (i.client_people || 1), 0);
    const totalPosHoras = posHorasItems.reduce((s, i) => s + i.horas, 0);
    const totalPosEntregas = posEntregaItems.reduce((s, i) => s + i.qtd, 0);

    return { producaoItems, posHorasItems, posEntregaItems, logItems, totalProducaoDias, totalProducaoPessoas, totalPosHoras, totalPosEntregas };
  }, [items]);

  const proposalName = useMemo(() => {
    const num = existing?.budget_number;
    const ver = existing?.version ?? 1;
    const numPart = num ? `#${num}` : "#???";
    const verPart = ver > 1 ? ` v${ver}` : "";
    return `Proposta Adverse ${numPart}${verPart} - ${clientName || "..."} | ${projectName || "..."}`;
  }, [existing?.budget_number, existing?.version, clientName, projectName]);

  const handleSave = async (status: string) => {
    const validItems = items.filter((i) => i.item_name.trim());
    saveBudget.mutate(
      {
        budget: {
          ...(budgetId ? { id: budgetId } : {}),
          project_name: projectName,
          client_name: clientName,
          status,
          markup_percent: markupPercent,
          tax_percent: taxPercent,
          bv_percent: bvPercent,
          commission_percent: commissionPercent,
          discount,
          addition,
          subtotal_1: totals.subtotal1,
          subtotal_2: totals.subtotal2,
          tax_value: totals.taxValue,
          bv_value: totals.bvValue,
          commission_value: totals.commissionValue,
          total_value: totals.totalValue,
          margin_value: totals.marginValue,
          margin_percent: totals.marginPercent,
          created_by: null,
          budget_number: existing?.budget_number ?? null,
          version: existing?.version ?? 1,
          parent_budget_id: existing?.parent_budget_id ?? null,
          is_latest_version: existing?.is_latest_version ?? true,
          proposal_name: proposalName,
          deal_id: dealId,
          not_included: notIncluded,
        } as any,
        items: validItems,
      },
      { onSuccess: () => onClose() }
    );
  };

  const handleApprove = async (opts: {
    createProject: boolean;
    projectName: string;
    startDate: string;
    deliveryDate: string;
    responsibleId: string;
  }) => {
    const validItems = items.filter((i) => i.item_name.trim());
    saveBudget.mutate(
      {
        budget: {
          ...(budgetId ? { id: budgetId } : {}),
          project_name: projectName,
          client_name: clientName,
          status: "approved",
          markup_percent: markupPercent,
          tax_percent: taxPercent,
          bv_percent: bvPercent,
          commission_percent: commissionPercent,
          discount,
          addition,
          subtotal_1: totals.subtotal1,
          subtotal_2: totals.subtotal2,
          tax_value: totals.taxValue,
          bv_value: totals.bvValue,
          commission_value: totals.commissionValue,
          total_value: totals.totalValue,
          margin_value: totals.marginValue,
          margin_percent: totals.marginPercent,
          created_by: null,
          budget_number: existing?.budget_number ?? null,
          version: existing?.version ?? 1,
          parent_budget_id: existing?.parent_budget_id ?? null,
          is_latest_version: existing?.is_latest_version ?? true,
          proposal_name: proposalName,
          deal_id: dealId,
          not_included: notIncluded,
        } as any,
        items: validItems,
      },
      {
        onSuccess: async () => {
          if (opts.createProject) {
            try {
              await supabase.from("projects").insert({
                name: opts.projectName,
                client_name: clientName,
                status: "em_producao",
                sold_value: totals.totalValue,
                sold_date: new Date().toISOString().slice(0, 10),
                delivery_date: opts.deliveryDate || null,
              } as any);
              toast({ title: "Projeto criado!" });
            } catch (err: any) {
              toast({ title: "Erro ao criar projeto", description: err.message, variant: "destructive" });
            }
          }
          onClose();
        },
      }
    );
    setApprovalModalOpen(false);
  };

  const handleNewVersion = (notes: string) => {
    if (!budgetId) return;
    // Save version notes on current budget first, then create new version
    createNewVersion.mutate(budgetId, {
      onSuccess: async (newId) => {
        // Update the new version with the notes
        if (notes.trim()) {
          await supabase
            .from("budgets")
            .update({ version_notes: notes } as any)
            .eq("id", newId);
        }
        setNewVersionOpen(false);
        if (onOpenVersion) onOpenVersion(newId);
      },
    });
  };

  // Não Inclui management
  const addNotIncludedItem = () => {
    setNotIncluded((prev) => [...prev, ""]);
  };

  const updateNotIncludedItem = (index: number, value: string) => {
    setNotIncluded((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const removeNotIncludedItem = (index: number) => {
    setNotIncluded((prev) => prev.filter((_, i) => i !== index));
  };

  const isApproved = existing?.status === "approved";
  const budgetLabel = existing?.budget_number
    ? `#${existing.budget_number} v${existing.version}`
    : "Novo";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-xl font-bold text-foreground truncate">
                Orçamento {budgetLabel}
              </h1>
              {existing && (
                <Badge variant={existing.status === "approved" ? "default" : "secondary"} className="shrink-0">
                  {existing.status === "approved" ? "Aprovado" : existing.status === "rejected" ? "Rejeitado" : "Rascunho"}
                </Badge>
              )}
            </div>
            {existing && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {existing.client_name} — {existing.project_name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isApproved && (
              <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(true)}>
                <Save className="h-3.5 w-3.5 mr-1" /> Template
              </Button>
            )}
            {budgetId && (
              <>
                <Button variant="outline" size="sm" onClick={() => setNewVersionOpen(true)} disabled={createNewVersion.isPending}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Nova Versão
                </Button>
                {existing?.budget_number && versions.length > 1 && (
                  <VersionHistoryModal
                    versions={versions}
                    currentId={budgetId}
                    onOpenVersion={onOpenVersion}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Basic Info - compact */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Deal vinculado</Label>
              <Select
                value={dealId || "none"}
                onValueChange={(v) => setDealId(v === "none" ? null : v)}
                disabled={isApproved}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {deals
                    .filter((d) => d.stage !== "perdido")
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="flex items-center gap-1.5">
                          <Link className="h-3 w-3 text-primary" />
                          {d.title} — {d.client?.name || ""}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Empresa Y" disabled={isApproved} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Projeto</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex: Campanha X" disabled={isApproved} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Proposta</Label>
              <Input value={proposalName} readOnly className="h-8 text-sm bg-muted/50 text-muted-foreground cursor-default" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: Items */}
        <div className="lg:col-span-2 space-y-3">
          {categories.map((cat) => {
            const config = getCatConfig(cat);
            const catItems = items
              .map((item, idx) => ({ item, idx }))
              .filter(({ item }) => item.category === cat);
            const hasNewRow = newRowCats.has(cat);

            return (
              <Card key={cat}>
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{cat}</CardTitle>
                    {!isApproved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => addInlineRow(cat)}
                        disabled={hasNewRow}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Adicionar
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {catItems.length === 0 && !hasNewRow ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum item</p>
                  ) : isMobile ? (
                    <div className="px-3 pb-3 space-y-2">
                      {catItems.map(({ item, idx }) => {
                        const mobileConfig = cat === "LOGÍSTICA" ? getCatConfig(cat, item.item_name) : config;
                        return (
                          <MobileItemRow
                            key={idx}
                            item={item}
                            config={mobileConfig}
                            onUpdate={(field, value) => updateItem(idx, field, value)}
                            onToggleSupplier={(checked) => toggleSupplier(idx, checked)}
                            onRemove={() => removeItem(idx)}
                            readOnly={isApproved}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50 bg-muted/20">
                            <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-1.5 min-w-[160px]">Nome</th>
                            <th className="text-center text-[11px] font-medium text-muted-foreground px-1 py-1.5 w-[60px]">{config.field1}</th>
                            {config.field2 && (
                              <th className="text-center text-[11px] font-medium text-muted-foreground px-1 py-1.5 w-[60px]">{config.field2}</th>
                            )}
                            <th className="text-center text-[11px] font-medium text-muted-foreground px-1 py-1.5 w-[80px]">{config.field3}</th>
                            <th className="text-right text-[11px] font-medium text-muted-foreground px-2 py-1.5 w-[80px]">Total</th>
                            <th className="text-center text-[11px] font-medium text-muted-foreground px-1 py-1.5 w-[44px]">Forn?</th>
                            <th className="text-center text-[11px] font-medium text-muted-foreground px-1 py-1.5 w-[36px]"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {catItems.map(({ item, idx }) => {
                            const isNewRow = hasNewRow && idx === catItems[catItems.length - 1]?.idx && !item.item_name.trim();
                            const itemConfig = cat === "LOGÍSTICA" ? getCatConfig(cat, item.item_name) : config;
                            return (
                              <ItemTableRow
                                key={idx}
                                item={item}
                                config={itemConfig}
                                headerConfig={config}
                                supplierContacts={supplierContacts}
                                onUpdate={(field, value) => updateItem(idx, field, value)}
                                onToggleSupplier={(checked) => toggleSupplier(idx, checked)}
                                onRemove={() => {
                                  removeItem(idx);
                                  if (isNewRow) {
                                    setNewRowCats((prev) => {
                                      const next = new Set(prev);
                                      next.delete(cat);
                                      return next;
                                    });
                                  }
                                }}
                                readOnly={isApproved}
                                isNewRow={isNewRow}
                                nameRef={isNewRow ? (el) => { newRowNameRefs.current[cat] = el; } : undefined}
                                onConfirm={() => {
                                  if (item.item_name.trim()) {
                                    confirmInlineRow(cat);
                                  }
                                }}
                                onCancel={() => cancelInlineRow(cat)}
                                onEnterLastField={() => {
                                  if (item.item_name.trim()) {
                                    confirmInlineRow(cat);
                                    setTimeout(() => addInlineRow(cat), 50);
                                  }
                                }}
                              />
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Add Category */}
          {!isApproved && (
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nova categoria..."
                className="max-w-xs h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
              <Button variant="outline" size="sm" onClick={addCategory}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Categoria
              </Button>
            </div>
          )}

          {/* Não Inclui Section */}
          <Card>
            <Collapsible open={notIncludedOpen} onOpenChange={setNotIncludedOpen}>
              <CardHeader className="py-2 px-4">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Não Inclui ({notIncluded.filter((i) => i.trim()).length})
                    </CardTitle>
                    {notIncludedOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="px-4 pb-3 space-y-2">
                  {notIncluded.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">•</span>
                      <Input
                        value={item}
                        onChange={(e) => updateNotIncludedItem(idx, e.target.value)}
                        placeholder="Item não incluído..."
                        className="h-7 text-xs flex-1"
                        disabled={isApproved}
                      />
                      {!isApproved && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/50 hover:text-destructive" onClick={() => removeNotIncludedItem(idx)}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!isApproved && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addNotIncludedItem}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar
                    </Button>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Right: Resumo + Settings + Profitability */}
        <div className="space-y-3">
          {/* Resumo de Entregas */}
          <Card>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resumo de Entregas</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2 text-xs">
              {items.filter((i) => i.item_name.trim()).length === 0 ? (
                <p className="text-muted-foreground text-center py-2">Adicione itens para ver o resumo</p>
              ) : (
                <>
                  {resumoEntregas.producaoItems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Equipe ({resumoEntregas.totalProducaoDias} {resumoEntregas.totalProducaoDias > 1 ? "diárias" : "diária"} com {resumoEntregas.totalProducaoPessoas} {resumoEntregas.totalProducaoPessoas > 1 ? "pessoas" : "pessoa"})
                      </p>
                      <ul className="space-y-0.5">
                        {resumoEntregas.producaoItems.map((r, i) => (
                          <li key={i} className="text-foreground">
                            • {r.qtd}x {r.nome} ({r.dias} diár.)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(resumoEntregas.posHorasItems.length > 0 || resumoEntregas.posEntregaItems.length > 0) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Pós-Produção
                      </p>
                      <ul className="space-y-0.5">
                        {resumoEntregas.posHorasItems.map((r, i) => (
                          <li key={`h${i}`} className="text-foreground">
                            • {r.horas}h de {r.nome.toLowerCase()}
                          </li>
                        ))}
                        {resumoEntregas.posEntregaItems.map((r, i) => (
                          <li key={`e${i}`} className="text-foreground">
                            • {r.qtd} {r.nome.toLowerCase()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {resumoEntregas.logItems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Logística</p>
                      <ul className="space-y-0.5">
                        {resumoEntregas.logItems.map((r, i) => (
                          <li key={i} className="text-foreground">
                            • {r.nome}: {r.dias} {r.dias > 1 ? "dias" : "dia"}
                            {r.pessoas != null && r.pessoas > 0 && ` × ${r.pessoas} ${r.pessoas > 1 ? "pessoas" : "pessoa"}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* NÃO INCLUI in resumo */}
                  {notIncluded.filter((i) => i.trim()).length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-destructive/80 mb-1">NÃO INCLUI</p>
                        <ul className="space-y-0.5">
                          {notIncluded.filter((i) => i.trim()).map((item, i) => (
                            <li key={i} className="text-muted-foreground">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  <Separator />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total</p>
                    <ul className="space-y-0.5">
                      {resumoEntregas.totalProducaoDias > 0 && (
                        <li className="text-foreground font-medium">• {resumoEntregas.totalProducaoDias} {resumoEntregas.totalProducaoDias > 1 ? "diárias" : "diária"} de produção com {resumoEntregas.totalProducaoPessoas} {resumoEntregas.totalProducaoPessoas > 1 ? "pessoas" : "pessoa"}</li>
                      )}
                      {resumoEntregas.totalPosHoras > 0 && (
                        <li className="text-foreground font-medium">• {resumoEntregas.totalPosHoras}h de pós-produção{resumoEntregas.totalPosEntregas > 0 ? ` + ${resumoEntregas.totalPosEntregas} ${resumoEntregas.totalPosEntregas > 1 ? "entregas" : "entrega"}` : ""}</li>
                      )}
                      {resumoEntregas.totalPosHoras === 0 && resumoEntregas.totalPosEntregas > 0 && (
                        <li className="text-foreground font-medium">• {resumoEntregas.totalPosEntregas} {resumoEntregas.totalPosEntregas > 1 ? "entregas" : "entrega"} de pós-produção</li>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configurações</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Markup %</Label>
                  <NumInput value={markupPercent} onChange={setMarkupPercent} className="h-7 text-xs" disabled={isApproved} />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Imposto %</Label>
                  <NumInput value={taxPercent} onChange={setTaxPercent} className="h-7 text-xs" disabled={isApproved} />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">BV %</Label>
                  <Select value={String(bvPercent)} onValueChange={(v) => setBvPercent(Number(v))} disabled={isApproved}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BV_OPTIONS.map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Commission Split */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Comissão</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={djEnabled} onCheckedChange={(c) => setDjEnabled(!!c)} disabled={isApproved} className="h-3.5 w-3.5" />
                    <span className="text-xs flex-1">Djêisson</span>
                    <NumInput value={djPercent} onChange={setDjPercent} className="h-6 text-xs w-12" min={0} disabled={isApproved} />
                    <span className="text-[10px] text-muted-foreground">%</span>
                    <span className="text-[10px] font-medium w-16 text-right">
                      {djEnabled ? formatCurrency(totals.subtotal2 * (djPercent / 100)) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={robertEnabled} onCheckedChange={(c) => setRobertEnabled(!!c)} disabled={isApproved} className="h-3.5 w-3.5" />
                    <span className="text-xs flex-1">Robert</span>
                    <NumInput value={robertPercent} onChange={setRobertPercent} className="h-6 text-xs w-12" min={0} disabled={isApproved} />
                    <span className="text-[10px] text-muted-foreground">%</span>
                    <span className="text-[10px] font-medium w-16 text-right">
                      {robertEnabled ? formatCurrency(totals.subtotal2 * (robertPercent / 100)) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-border/50">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold">{commissionPercent}% ({formatCurrency(totals.commissionValue)})</span>
                  </div>
                </div>
              </div>

              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Desconto R$</Label>
                  <NumInput value={discount} onChange={setDiscount} className="h-7 text-xs" disabled={isApproved} />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Acréscimo R$</Label>
                  <NumInput value={addition} onChange={setAddition} className="h-7 text-xs" disabled={isApproved} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profitability */}
          <Card className="border-primary/20">
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rentabilidade</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1 text-xs">
              <ProfitRow label="Sub-Total 1" value={formatCurrency(totals.subtotal1)} />
              <ProfitRow label={`+ Markup (${markupPercent}%)`} value={formatCurrency(totals.markupValue)} />
              <Separator className="my-1" />
              <ProfitRow label="Sub-Total 2" value={formatCurrency(totals.subtotal2)} bold />
              <ProfitRow label={`+ Imposto (${taxPercent}%)`} value={formatCurrency(totals.taxValue)} />
              <ProfitRow label={`+ BV (${bvPercent}%)`} value={formatCurrency(totals.bvValue)} />
              <ProfitRow label={`+ Comissão (${commissionPercent}%)`} value={formatCurrency(totals.commissionValue)} />
              {discount > 0 && <ProfitRow label="- Desconto" value={`-${formatCurrency(discount)}`} />}
              {addition > 0 && <ProfitRow label="+ Acréscimo" value={formatCurrency(addition)} />}
              <Separator className="my-1" />

              <div className="text-center py-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">TOTAL</p>
                <p className="text-2xl font-bold text-foreground leading-tight">
                  {formatCurrency(totals.totalValue)}
                </p>
              </div>

              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">💰 Margem Real</p>
                <p className={`text-base font-semibold ${marginColor(totals.marginPercent)}`}>
                  {formatCurrency(totals.marginValue)} ({formatPercent(totals.marginPercent)})
                </p>
              </div>

              {/* Cost Breakdown */}
              <div className="space-y-1 rounded-lg border border-border bg-background p-2 mt-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">📊 Custos</p>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">├ Fornecedores</span>
                    <span className="font-medium">{formatCurrency(totals.supplierTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">├ BV</span>
                    <span className="font-medium">{formatCurrency(totals.bvValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">├ Comissão</span>
                    <span className="font-medium">{formatCurrency(totals.commissionValue)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground/60 italic">
                    <span>└ Impostos</span>
                    <span>{formatCurrency(totals.taxValue)}</span>
                  </div>
                </div>
              </div>

              {Object.keys(totals.categoryBreakdown).length > 0 && (
                <div className="space-y-0.5 mt-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Por categoria</p>
                  {Object.entries(totals.categoryBreakdown).map(([cat, val]) => {
                    const pct = totals.subtotal1 > 0 ? (val / totals.subtotal1) * 100 : 0;
                    return (
                      <div key={cat} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{cat}</span>
                        <span className="font-medium">{formatPercent(pct)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        {isApproved ? (
          <Button size="sm" onClick={() => setNewVersionOpen(true)} disabled={createNewVersion.isPending}>
            <Copy className="mr-2 h-4 w-4" />
            Nova Versão
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={saveBudget.isPending}>
              Salvar Rascunho
            </Button>
            <Button size="sm" onClick={() => setApprovalModalOpen(true)} disabled={saveBudget.isPending}>
              <Check className="mr-2 h-4 w-4" />
              Aprovar
            </Button>
          </>
        )}
      </div>

      {/* Modals */}
      <ApprovalModal
        open={approvalModalOpen}
        budgetName={projectName}
        totalValue={totals.totalValue}
        onConfirm={handleApprove}
        onCancel={() => setApprovalModalOpen(false)}
      />

      <SaveTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        items={items}
        markupPercent={markupPercent}
        taxPercent={taxPercent}
        commissionPercent={commissionPercent}
        bvPercent={bvPercent}
        notIncluded={notIncluded}
      />

      <NewVersionModal
        open={newVersionOpen}
        onConfirm={handleNewVersion}
        onCancel={() => setNewVersionOpen(false)}
      />
    </div>
  );
}

/* ── Desktop Table Row ── */

function ItemTableRow({
  item,
  config,
  headerConfig,
  supplierContacts,
  onUpdate,
  onToggleSupplier,
  onRemove,
  readOnly,
  isNewRow,
  nameRef,
  onConfirm,
  onCancel,
  onEnterLastField,
}: {
  item: BudgetItem;
  config: CategoryFieldConfig;
  headerConfig?: CategoryFieldConfig;
  supplierContacts?: any[];
  onUpdate: (field: keyof BudgetItem, value: any) => void;
  onToggleSupplier: (checked: boolean) => void;
  onRemove: () => void;
  readOnly?: boolean;
  isNewRow?: boolean;
  nameRef?: (el: HTMLInputElement | null) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onEnterLastField?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hdr = headerConfig ?? config;

  const handleKeyDown = (e: React.KeyboardEvent, isLastField?: boolean) => {
    if (e.key === "Escape" && isNewRow && !item.item_name.trim()) {
      onCancel?.();
    }
    if (e.key === "Enter" && isLastField) {
      onEnterLastField?.();
    }
  };

  return (
    <>
      <tr className={`border-b border-border/30 hover:bg-muted/20 ${isNewRow ? "ring-1 ring-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5" : ""}`}>
        <td className="px-3 py-1.5">
          {readOnly ? (
            <span className="text-sm font-medium">{item.item_name}</span>
          ) : (
            <Input
              ref={nameRef}
              value={item.item_name}
              onChange={(e) => onUpdate("item_name", e.target.value)}
              placeholder={isNewRow ? "Digite aqui..." : "Nome..."}
              className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border px-1"
              onKeyDown={(e) => handleKeyDown(e)}
            />
          )}
        </td>
        <td className="px-1 py-1.5">
          {readOnly ? (
            <span className="text-xs text-center block">{item.client_days}</span>
          ) : (
            <NumInput
              value={item.client_days}
              onChange={(v) => onUpdate("client_days", v)}
              className="h-7 text-xs text-center w-[56px] px-1"
              min={0}
              step={0.5}
              onKeyDown={(e) => handleKeyDown(e as any)}
            />
          )}
        </td>
        {hdr.field2 && (
          config.field2 ? (
            <td className="px-1 py-1.5">
              {readOnly ? (
                <span className="text-xs text-center block">{item.client_people}</span>
              ) : (
                <NumInput
                  value={item.client_people}
                  onChange={(v) => onUpdate("client_people", v)}
                  className="h-7 text-xs text-center w-[56px] px-1"
                  min={1}
                  step={1}
                  onKeyDown={(e) => handleKeyDown(e as any)}
                />
              )}
            </td>
          ) : (
            <td className="px-1 py-1.5">
              <span className="text-xs text-center block text-muted-foreground/40">—</span>
            </td>
          )
        )}
        <td className="px-1 py-1.5">
          {readOnly ? (
            <span className="text-xs text-center block">{formatCurrency(item.client_unit_price)}</span>
          ) : (
            <NumInput
              value={item.client_unit_price}
              onChange={(v) => onUpdate("client_unit_price", v)}
              className="h-7 text-xs text-center w-[76px] px-1"
              min={0}
              onKeyDown={(e) => handleKeyDown(e as any, true)}
            />
          )}
        </td>
        <td className="px-2 py-1.5 text-right">
          <span className="text-xs font-semibold">{formatCurrency(item.client_price)}</span>
        </td>
        <td className="px-1 py-1.5 text-center">
          <button
            type="button"
            onClick={() => {
              if (!item.has_supplier_cost) {
                onToggleSupplier(true);
                setExpanded(true);
              } else {
                setExpanded(!expanded);
              }
            }}
            className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs transition-colors ${
              item.has_supplier_cost
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            disabled={readOnly}
            title={item.has_supplier_cost ? "Tem fornecedor" : "Sem fornecedor"}
          >
            {item.has_supplier_cost ? (
              expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
            ) : "○"}
          </button>
        </td>
        <td className="px-1 py-1.5 text-center">
          {!readOnly && (
            isNewRow && item.item_name.trim() ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[hsl(var(--success))] hover:text-[hsl(var(--success))]"
                onClick={onConfirm}
                title="Confirmar"
              >
                <Check className="h-3 w-3" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive" onClick={onRemove}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )
          )}
        </td>
      </tr>
      {/* Supplier inline row */}
      {item.has_supplier_cost && expanded && (
        <tr className="bg-muted/10 border-b border-border/20">
          <td colSpan={hdr.field2 ? 7 : 6} className="px-3 py-1.5">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground shrink-0">└─ Paga:</span>
              <NumInput
                value={item.supplier_days}
                onChange={(v) => onUpdate("supplier_days", v)}
                className="h-6 text-[11px] w-12 text-center px-0.5"
                min={0}
                step={0.5}
                disabled={readOnly}
                placeholder={config.field1.charAt(0).toLowerCase()}
              />
              <span className="text-muted-foreground text-[10px]">×</span>
              {config.field2 && (
                <>
                  <NumInput
                    value={item.supplier_people}
                    onChange={(v) => onUpdate("supplier_people", v)}
                    className="h-6 text-[11px] w-12 text-center px-0.5"
                    min={0}
                    step={1}
                    disabled={readOnly}
                    placeholder="p"
                  />
                  <span className="text-muted-foreground text-[10px]">×</span>
                </>
              )}
              <NumInput
                value={item.supplier_unit_price}
                onChange={(v) => onUpdate("supplier_unit_price", v)}
                className="h-6 text-[11px] w-16 text-center px-0.5"
                min={0}
                disabled={readOnly}
                placeholder="R$"
              />
              <span className="text-muted-foreground">=</span>
              <span className="font-semibold">{formatCurrency(item.supplier_cost)}</span>
              <span className="text-muted-foreground mx-1">|</span>
              <span className="text-muted-foreground">Sobra:</span>
              <span className={`font-semibold ${marginColor(item.margin_percent)}`}>
                {formatCurrency(item.margin_value)} ({formatPercent(item.margin_percent)}) {marginIcon(item.margin_percent)}
              </span>
              <button
                type="button"
                onClick={() => {
                  onToggleSupplier(false);
                  setExpanded(false);
                }}
                className="ml-auto text-[10px] text-destructive/60 hover:text-destructive"
                disabled={readOnly}
              >
                remover
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Mobile Item Card ── */

function MobileItemRow({
  item,
  config,
  onUpdate,
  onToggleSupplier,
  onRemove,
  readOnly,
}: {
  item: BudgetItem;
  config: CategoryFieldConfig;
  onUpdate: (field: keyof BudgetItem, value: any) => void;
  onToggleSupplier: (checked: boolean) => void;
  onRemove: () => void;
  readOnly?: boolean;
}) {
  const unitLabel = config.field1.charAt(0).toLowerCase();
  const formula = config.field2
    ? `${item.client_days}${unitLabel} × ${item.client_people}p × ${formatCurrency(item.client_unit_price)}`
    : `${item.client_days}${unitLabel} × ${formatCurrency(item.client_unit_price)}`;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">{item.item_name || "Sem nome"}</span>
        {!readOnly && (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70" onClick={onRemove}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {formula} = <span className="font-semibold text-foreground">{formatCurrency(item.client_price)}</span>
      </div>
      {item.has_supplier_cost ? (
        <div className={`text-xs ${marginColor(item.margin_percent)}`}>
          ● Forn: {formatCurrency(item.supplier_cost)} | Sobra: {formatCurrency(item.margin_value)} ({formatPercent(item.margin_percent)})
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">○ Sem fornecedor</div>
      )}
    </div>
  );
}

/* ── Version History Modal ── */

function VersionHistoryModal({
  versions,
  currentId,
  onOpenVersion,
}: {
  versions: any[];
  currentId: string;
  onOpenVersion?: (id: string) => void;
}) {
  return (
    <TooltipProvider>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <History className="h-3.5 w-3.5 mr-1" /> {versions.length} versões
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico — Orçamento #{versions[0]?.budget_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {[...versions].reverse().map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  v.id === currentId ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  {v.is_latest_version && <span className="text-[hsl(var(--success))]">✓</span>}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-medium text-sm cursor-default">
                        v{v.version} — {formatDate(v.created_at)}
                      </span>
                    </TooltipTrigger>
                    {v.version_notes && (
                      <TooltipContent>
                        <p className="text-xs max-w-[200px]">{v.version_notes}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {v.version_notes && (
                    <span className="text-[10px] text-muted-foreground italic truncate max-w-[120px]">
                      {v.version_notes}
                    </span>
                  )}
                  {v.is_latest_version && (
                    <Badge variant="default" className="text-xs">ATUAL</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(v.total_value)}</span>
                  {v.id !== currentId && onOpenVersion && (
                    <Button variant="ghost" size="sm" onClick={() => onOpenVersion(v.id)}>
                      Ver
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

/* ── Helpers ── */

function marginColor(percent: number) {
  if (percent >= 35) return "text-[hsl(var(--success))]";
  if (percent >= 15) return "text-[hsl(var(--warning))]";
  return "text-destructive";
}

function marginIcon(percent: number) {
  if (percent >= 35) return "✅";
  if (percent >= 15) return "⚠️";
  return "❌";
}

function ProfitRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-muted-foreground ${bold ? "font-semibold text-foreground" : ""}`}>{label}</span>
      <span className={bold ? "font-bold text-foreground" : ""}>{value}</span>
    </div>
  );
}
