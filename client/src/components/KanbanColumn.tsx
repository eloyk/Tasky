import { useDroppable } from "@dnd-kit/core";
import { Task } from "@shared/schema";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function KanbanColumn({ id, title, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-card border border-card-border rounded-md p-4 mb-4 shrink-0">
        <h3 className="text-lg font-medium text-foreground">
          {title} <span className="text-sm text-muted-foreground">({tasks.length})</span>
        </h3>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 bg-card/30 border-2 border-dashed rounded-md p-4 overflow-y-auto min-h-0 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-border"
        }`}
        data-testid={`column-${id}`}
      >
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay tareas
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
