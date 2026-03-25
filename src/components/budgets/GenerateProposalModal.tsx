import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Link as LinkIcon, Copy, Check, Loader2 } from "lucide-react";
import { useCreateProposalLetter } from "@/hooks/useProposalLetters";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Budget, BudgetItem } from "@/hooks/useBudgets";

interface Props {
  open: boolean;
  onClose: () => void;
  budget: Budget;
  items: BudgetItem[];
}

export function GenerateProposalModal({ open, onClose, budget, items }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const createLetter = useCreateProposalLetter();

  const [templateType, setTemplateType] = useState<"completa" | "reduzida">("completa");
  const [contactName, setContactName] = useState("");
  const [contactCompany, setContactCompany] = useState(budget.client_name || "");
  const [projectDescription, setProjectDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [deliverables, setDeliverables] = useState<{ name: string; description: string }[]>(
    items.filter(i => i.client_price > 0).map(i => ({ name: i.item_name, description: i.category }))
  );
  const [paymentConditions, setPaymentConditions] = useState("À vista — 30 dias após aprovação");
  const [validityDays, setValidityDays] = useState(15);

  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const proposalUrl = generatedToken
    ? `${window.location.origin}/proposta/${generatedToken}`
    : null;

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const removeTag = (idx: number) => setTags(tags.filter((_, i) => i !== idx));

  const addDeliverable = () => setDeliverables([...deliverables, { name: "", description: "" }]);
  const removeDeliverable = (idx: number) => setDeliverables(deliverables.filter((_, i) => i !== idx));
  const updateDeliverable = (idx: number, field: "name" | "description", value: string) => {
    const updated = [...deliverables];
    updated[idx] = { ...updated[idx], [field]: value };
    setDeliverables(updated);
  };

  const handleGenerate = async () => {
    if (!contactName.trim()) {
      toast({ title: "Preencha o nome do contato", variant: "destructive" });
      return;
    }
    const result = await createLetter.mutateAsync({
      budget_id: budget.id,
      template_type: templateType,
      contact_name: contactName,
      contact_company: contactCompany,
      project_description: projectDescription || undefined,
      tags,
      deliverables: deliverables.filter(d => d.name.trim()),
      payment_conditions: paymentConditions,
      validity_days: validityDays,
      created_by: user?.id,
    });
    setGeneratedToken(result.token);
  };

  const copyLink = async () => {
    if (proposalUrl) {
      await navigator.clipboard.writeText(proposalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setGeneratedToken(null);
    setCopied(false);
    onClose();
  };

  if (generatedToken) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Carta de proposta gerada!</DialogTitle>
            <DialogDescription>Copie o link abaixo e envie ao cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
              <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <code className="text-xs flex-1 break-all text-foreground">{proposalUrl}</code>
              <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4 text-[hsl(var(--success))]" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={copyLink}>
                {copied ? "Copiado!" : "Copiar link"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const msg = encodeURIComponent(`Olá ${contactName}, segue a proposta para o projeto ${budget.project_name}: ${proposalUrl}`);
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                }}
              >
                Enviar via WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Carta de Proposta</DialogTitle>
          <DialogDescription>
            #{budget.budget_number} — {budget.project_name} — {budget.client_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Template type */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modelo</Label>
            <RadioGroup value={templateType} onValueChange={(v) => setTemplateType(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="completa" />
                <span className="text-sm">Completa <span className="text-muted-foreground">(apresentação + cases + NPS)</span></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="reduzida" />
                <span className="text-sm">Reduzida <span className="text-muted-foreground">(escopo + valor + aprovação)</span></span>
              </label>
            </RadioGroup>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do contato</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Ex: Mateus Roncaglio" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Empresa</Label>
              <Input value={contactCompany} onChange={e => setContactCompany(e.target.value)} placeholder="Ex: Sicredi Sul Minas" />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição do projeto</Label>
            <Textarea
              value={projectDescription}
              onChange={e => setProjectDescription(e.target.value)}
              placeholder="Breve descrição do projeto para a carta..."
              rows={3}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="Ex: Evento Corporativo"
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addTag} type="button"><Plus className="h-4 w-4" /></Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.map((t, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {t}
                    <button onClick={() => removeTag(i)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Deliverables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Entregas</Label>
              <Button variant="ghost" size="sm" onClick={addDeliverable} type="button"><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
            </div>
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input
                      value={d.name}
                      onChange={e => updateDeliverable(i, "name", e.target.value)}
                      placeholder="Nome da entrega"
                      className="text-sm"
                    />
                    <Input
                      value={d.description}
                      onChange={e => updateDeliverable(i, "description", e.target.value)}
                      placeholder="Descrição"
                      className="text-sm"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" onClick={() => removeDeliverable(i)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Payment + Validity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Condições de pagamento</Label>
              <Input value={paymentConditions} onChange={e => setPaymentConditions(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Validade (dias)</Label>
              <Input type="number" value={validityDays} onChange={e => setValidityDays(Number(e.target.value))} min={1} />
            </div>
          </div>

          {/* Action */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={createLetter.isPending}>
              {createLetter.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar proposta
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
