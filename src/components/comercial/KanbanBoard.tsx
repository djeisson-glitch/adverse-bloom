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
import { STAGES, type Deal, type Stage } from "@/hooks/useDeals";
import { KanbanColumn } from "./KanbanColumn";
import { DealCard } from "./DealCard";
import type { Task } from "@/hooks/useTasks";

interface Props {
  deals: Deal[];
  onMoveDeal: (dealId: string, newStage: Stage) => void;
  onEditDeal: (deal: Deal) => void;
  taskCounts?: Record<string, number>;
}

export function KanbanBoard({ deals, onMoveDeal, onEditDeal, taskCounts = {} }: Props) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find((d) => d.id === event.active.id);
    setActiveDeal(deal || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const overId = over.id as string;

    const targetStage = STAGES.find((s) => s.id === overId);
    if (targetStage) {
      const deal = deals.find((d) => d.id === dealId);
      if (deal && deal.stage !== targetStage.id) {
        onMoveDeal(dealId, targetStage.id);
      }
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[60vh]">
        {STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.id);
          const total = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              total={total}
              onEditDeal={onEditDeal}
              taskCounts={taskCounts}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeDeal ? <DealCard deal={activeDeal} onEdit={() => {}} isDragging pendingTaskCount={taskCounts[activeDeal.id] || 0} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
