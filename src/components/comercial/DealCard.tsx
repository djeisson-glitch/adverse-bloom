import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDate } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CalendarDays } from "lucide-react";
import type { Deal } from "@/hooks/useDeals";

interface Props {
  deal: Deal;
  onEdit: () => void;
  isDragging?: boolean;
}

export function DealCard({ deal, onEdit, isDragging }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const creatorName = deal.creator?.full_name || "";
  const initials = creatorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onEdit}
      className={`rounded-md border border-border/60 bg-card p-3 cursor-grab active:cursor-grabbing transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 ${
        isDragging ? "opacity-80 shadow-lg shadow-primary/10 rotate-2" : ""
      }`}
    >
      <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
      {deal.client && (
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {deal.client.name}{deal.client.company ? ` — ${deal.client.company}` : ""}
        </p>
      )}
      <p className="text-sm font-semibold text-primary mt-2">{formatCurrency(deal.value || 0)}</p>

      <div className="flex items-center justify-between mt-2">
        {deal.expected_close_date ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        ) : (
          <span />
        )}
        {deal.creator && (
          <Avatar className="h-5 w-5">
            <AvatarImage src={deal.creator.avatar_url || ""} />
            <AvatarFallback className="text-[9px] bg-secondary">{initials}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
