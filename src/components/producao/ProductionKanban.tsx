import { useState, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileText, Handshake } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Project } from "@/hooks/useProjects";
import { PRODUCTION_STAGES_NEW } from "@/hooks/useProjects";

export const PRODUCTION_STAGES = PRODUCTION_STAGES_NEW;

const billingBadge: Record<string, { label: string; className: string }> = {
  pending: { label: "A faturar", className: "bg-muted text-muted-foreground" },
  partial: { label: "Parcial", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  invoiced: { label: "Faturado", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  paid: { label: "Recebido", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

interface Props {
  projects: Project[];
  onMoveProject: (projectId: string, newStatus: string) => void;
  onEditProject?: (project: Project) => void;
}

function ProjectCard({ project, isDragging, onEdit }: { project: Project; isDragging?: boolean; onEdit?: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: project.id });
  const navigate = useNavigate();
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  // Clique abre o projeto; arrastar move de etapa. O clique dispara depois do
  // drop também, então medimos o deslocamento do ponteiro pra distinguir.
  const downPos = useRef<{ x: number; y: number } | null>(null);

  const isOverdue = project.delivery_date && new Date(project.delivery_date) < new Date();
  const billing = billingBadge[(project as any).billing_status] || billingBadge.pending;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`min-w-0 space-y-2 rounded-lg border border-border bg-card p-3 transition-shadow cursor-pointer active:cursor-grabbing ${
        isDragging ? "shadow-lg opacity-80" : "hover:border-primary/40 hover:shadow-md"
      }`}
      onPointerDownCapture={(e) => { downPos.current = { x: e.clientX, y: e.clientY }; }}
      onClick={(e) => {
        const d = downPos.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // foi drag, não clique
        if (onEdit) onEdit();
        else navigate(`/projetos/${project.id}`);
      }}
    >
      <p className="line-clamp-2 break-all text-sm font-medium leading-tight text-foreground" title={project.name}>{project.name}</p>
      <p className="truncate text-xs text-muted-foreground">{project.client_name || "—"}</p>
      
      <div className="flex items-center justify-between text-xs">
        <span className="text-primary font-semibold">
          {formatCurrency((project as any).contract_value || project.sold_value || 0)}
        </span>
        {project.delivery_date && (
          <span className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
            {formatDate(project.delivery_date)}
            {isOverdue && " ⚠"}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-1">
        <Badge variant="outline" className={`text-[10px] px-1.5 h-4 ${billing.className}`}>
          {billing.label}
        </Badge>
        <div className="flex gap-1">
          {(project as any).budget_id && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/orcamentos`); }}
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
            >
              <FileText className="h-3 w-3" />
            </button>
          )}
          {(project as any).deal_id && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/comercial`); }}
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
            >
              <Handshake className="h-3 w-3" />
            </button>
          )}
          {(project as any).clickup_task_id && (
            <a
              href={`https://app.clickup.com/t/${(project as any).clickup_task_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductionColumn({ stage, projects, onEditProject }: {
  stage: { id: string; label: string; color: string };
  projects: Project[];
  onEditProject?: (project: Project) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = projects.reduce((s, p) => s + ((p as any).contract_value || p.sold_value || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[260px] flex flex-col rounded-lg border bg-card/50 transition-colors ${
        isOver ? "border-primary/60 bg-primary/5" : stage.color
      }`}
    >
      <div className="px-3 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
          <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            {projects.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{formatCurrency(total)}</p>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-350px)]">
        {projects.map((project) => (
          <div key={project.id} data-id={project.id}>
            <ProjectCard project={project} onEdit={onEditProject ? () => onEditProject(project) : undefined} />
          </div>
        ))}
        {projects.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-8">Nenhum projeto</p>
        )}
      </div>
    </div>
  );
}

export function ProductionKanban({ projects, onMoveProject, onEditProject }: Props) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const project = projects.find((p) => p.id === event.active.id);
    setActiveProject(project || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProject(null);
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const targetStage = PRODUCTION_STAGES.find((s) => s.id === (over.id as string));
    if (targetStage) {
      const project = projects.find((p) => p.id === projectId);
      if (project && project.status !== targetStage.id) {
        onMoveProject(projectId, targetStage.id);
      }
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[50vh]">
        {PRODUCTION_STAGES.map((stage) => {
          const stageProjects = projects.filter((p) => p.status === stage.id);
          return (
            <ProductionColumn
              key={stage.id}
              stage={stage}
              projects={stageProjects}
              onEditProject={onEditProject}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeProject ? <ProjectCard project={activeProject} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
