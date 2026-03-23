import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus } from "lucide-react";
import { useTemplates, type ProposalTemplate } from "@/hooks/useTemplates";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectBlank: () => void;
  onSelectTemplate: (template: ProposalTemplate) => void;
}

export function NewBudgetModal({ open, onClose, onSelectBlank, onSelectTemplate }: Props) {
  const { data: templates = [] } = useTemplates();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Blank option */}
          <button
            onClick={onSelectBlank}
            className="w-full flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Em branco</p>
              <p className="text-xs text-muted-foreground">Começar do zero</p>
            </div>
          </button>

          {/* Templates */}
          {templates.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">ou use um template</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTemplate(t)}
                    className="w-full flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px]">{t.categories.length} itens</Badge>
                        <Badge variant="secondary" className="text-[10px]">Markup {t.markup_default}%</Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
