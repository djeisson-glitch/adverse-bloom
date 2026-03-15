import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBudgetVersions } from "@/hooks/useBudgets";
import { formatCurrency, formatDate } from "@/lib/format";

interface Props {
  budgetNumber: number;
  currentVersionId: string;
  onOpenVersion: (id: string) => void;
  onClose: () => void;
}

export function VersionHistoryModal({ budgetNumber, currentVersionId, onOpenVersion, onClose }: Props) {
  const { data: versions = [] } = useBudgetVersions(budgetNumber);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico — Orçamento #{budgetNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {[...versions].reverse().map((v) => (
            <div
              key={v.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                v.id === currentVersionId ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                {v.is_latest_version && <span className="text-[hsl(var(--success))]">✓</span>}
                <span className="font-medium text-sm">
                  v{v.version} — {formatDate(v.created_at)}
                </span>
                {v.is_latest_version && (
                  <Badge variant="default" className="text-xs">ATUAL</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{formatCurrency(v.total_value ?? 0)}</span>
                {v.id !== currentVersionId && (
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
  );
}
