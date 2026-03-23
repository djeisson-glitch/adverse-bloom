import { useDroppable } from "@dnd-kit/core";
import { formatCurrency } from "@/lib/format";
import { DealCard } from "./DealCard";
import type { Deal } from "@/hooks/useDeals";

interface Props {
  stage: { id: string; label: string };
  deals: Deal[];
  total: number;
  onEditDeal: (deal: Deal) => void;
  taskCounts?: Record<string, number>;
}

const stageColors: Record<string, string> = {
  contato: "border-blue-500/40",
  proposta: "border-amber-500/40",
  negociacao: "border-purple-500/40",
  ganho: "border-emerald-500/40",
  perdido: "border-red-500/40",
};

export function KanbanColumn({ stage, deals, total, onEditDeal, taskCounts = {} }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[280px] flex flex-col rounded-lg border bg-card/50 transition-colors ${
        isOver ? "border-primary/60 bg-primary/5" : stageColors[stage.id] || "border-border"
      }`}
    >
      <div className="px-3 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
          <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            {deals.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{formatCurrency(total)}</p>
      </div>

      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onEdit={() => onEditDeal(deal)} pendingTaskCount={taskCounts[deal.id] || 0} />
        ))}
        {deals.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-8">Nenhum deal</p>
        )}
      </div>
    </div>
  );
}
