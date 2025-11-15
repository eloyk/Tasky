import { useDraggable } from "@dnd-kit/core";
import { Calendar, GripVertical } from "lucide-react";
import { Task } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format, isPast } from "date-fns";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const priorityColors = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-accent text-accent-foreground",
    high: "bg-destructive/90 text-destructive-foreground",
  };

  const isOverdue = task.dueDate && isPast(new Date(task.dueDate));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border border-card-border rounded-md p-4 hover-elevate active-elevate-2 transition-all cursor-pointer"
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="text-base font-medium leading-tight flex-1">{task.title}</h4>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs px-3 py-1 rounded-full ${priorityColors[task.priority]}`}>
            {task.priority === "low" ? "Baja" : task.priority === "medium" ? "Media" : "Alta"}
          </Badge>
          <button
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing p-1 hover-elevate rounded"
            onClick={(e) => e.stopPropagation()}
            data-testid={`drag-handle-${task.id}`}
            aria-label="Drag task"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {task.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        {task.dueDate && (
          <div className={`flex items-center gap-1.5 text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
            <Calendar className="w-4 h-4" />
            <span className="font-mono">{format(new Date(task.dueDate), "MMM dd")}</span>
          </div>
        )}

        <div className="flex-1" />

        {task.assigneeId && (
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {task.assigneeId.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
