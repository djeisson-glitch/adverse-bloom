import { useState } from "react";
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
import type { Project } from "@/hooks/useProjects";

export const PRODUCTION_STAGES = [
  { id: "Pré-produção", label: "Pré-produção" },
  { id: "Captação", label: "Captação" },
  { id: "Pós-produção", label: "Pós-produção" },
  { id: "Aprovação do cliente", label: "Aprovação do cliente" },
  { id: "Encerrado", label: "Encerrado" },
] as const;

const stageColors: Record<string, string> = {
  "Pré-produção": "border-amber-500/40",
  "Captação": "border-blue-500/40",
  "Pós-produção": "border-purple-500/40",
  "Aprovação do cliente": "border-cyan-500/40",
  "Encerrado": "border-emerald-500/40",
};

interface Props {
  projects: Project[];
  onMoveProject: (projectId: string, newStatus: string) => void;
  onEditProject?: (project: Project) => void;
}

function ProjectCard({ project, isDragging, onEdit }: { project: Project; isDragging?: boolean; onEdit?: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: project.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-lg border border-border bg-card p-3 space-y-1.5 cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging ? "shadow-lg opacity-80" : "hover:shadow-md"
      }`}
      onClick={onEdit}
    >
      <p className="text-sm font-medium text-foreground leading-tight">{project.name}</p>
      <p className="text-xs text-muted-foreground">{project.client_name}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-primary font-medium">{formatCurrency(project.sold_value ?? 0)}</span>
        {project.delivery_date && (
          <span className="text-muted-foreground">{formatDate(project.delivery_date)}</span>
        )}
      </div>
    </div>
  );
}

function ProductionColumn({ stage, projects, onEditProject }: {
  stage: { id: string; label: string };
  projects: Project[];
  onEditProject?: (project: Project) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = projects.reduce((s, p) => s + (p.sold_value || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[260px] flex flex-col rounded-lg border bg-card/50 transition-colors ${
        isOver ? "border-primary/60 bg-primary/5" : stageColors[stage.id] || "border-border"
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
