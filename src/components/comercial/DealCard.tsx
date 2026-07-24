import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDate } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ListChecks, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Deal } from "@/hooks/useDeals";
import { useProjects, useCreateProjectFromBudget } from "@/hooks/useProjects";
import { toast } from "sonner";

interface Props {
  deal: Deal;
  onEdit: () => void;
  isDragging?: boolean;
  pendingTaskCount?: number;
}

export function DealCard({ deal, onEdit, isDragging, pendingTaskCount = 0 }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const createProject = useCreateProjectFromBudget();

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

  // Check if deal has a project linked
  const linkedProject = (projects || []).find((p: any) => p.deal_id === deal.id);
  const isWon = deal.stage === "fechamento";

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
      <div className="mt-2">
        <p className="text-sm font-semibold text-primary">{formatCurrency(deal.approved_value ?? deal.value ?? 0)}</p>
        {deal.approved_value != null && (
          <p className="text-[10px] text-muted-foreground">Valor orçado</p>
        )}
      </div>

      {/* Production badge for won deals */}
      {isWon && (
        <div className="mt-2">
          {linkedProject ? (
            <Badge
              variant="outline"
              className="text-[10px] bg-emerald-500/20 text-success border-emerald-500/30 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); navigate("/projetos"); }}
            >
              Em Produção →
            </Badge>
          ) : (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                // Find budget linked to this deal
                const budgets = (deal as any).budgets;
                // We need to find via query - simplified: navigate to projetos
                toast.info("Use 'Iniciar Produção' na página de Orçamentos");
              }}
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <Play className="h-3 w-3" /> Criar Projeto
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {deal.expected_close_date ? (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {formatDate(deal.expected_close_date)}
            </span>
          ) : (
            <span />
          )}
          {pendingTaskCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-warning">
              <ListChecks className="h-3 w-3" />
              {pendingTaskCount}
            </span>
          )}
        </div>
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
