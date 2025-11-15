import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Task, TaskStatus } from "@shared/schema";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

interface KanbanBoardProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newStatus: string) => void;
  onTaskClick: (task: Task) => void;
}

export function KanbanBoard({ tasks, onTaskMove, onTaskClick }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveTask(null);
      return;
    }

    const taskId = active.id as string;
    const newStatus = over.id as string;

    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) {
      onTaskMove(taskId, newStatus);
    }

    setActiveTask(null);
  };

  const pendientes = tasks.filter((t) => t.status === TaskStatus.PENDIENTE);
  const enProgreso = tasks.filter((t) => t.status === TaskStatus.EN_PROGRESO);
  const completadas = tasks.filter((t) => t.status === TaskStatus.COMPLETADA);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <KanbanColumn
          id={TaskStatus.PENDIENTE}
          title="Pendiente"
          tasks={pendientes}
          onTaskClick={onTaskClick}
        />
        <KanbanColumn
          id={TaskStatus.EN_PROGRESO}
          title="En Progreso"
          tasks={enProgreso}
          onTaskClick={onTaskClick}
        />
        <KanbanColumn
          id={TaskStatus.COMPLETADA}
          title="Completada"
          tasks={completadas}
          onTaskClick={onTaskClick}
        />
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="opacity-50">
            <TaskCard task={activeTask} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
