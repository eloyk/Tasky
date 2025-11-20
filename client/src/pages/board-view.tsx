import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Board, ProjectColumn, Task, InsertTask } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KanbanBoard } from "@/components/KanbanBoard";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";

export default function BoardView() {
  const params = useParams();
  const boardId = params.id as string;
  const [, setLocation] = useLocation();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: board, isLoading: boardLoading } = useQuery<Board>({
    queryKey: ["/api/boards", boardId],
    enabled: !!boardId,
  });

  const { data: columns = [], isLoading: columnsLoading } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/boards", boardId, "columns"],
    enabled: !!boardId,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: [`/api/boards/${boardId}/tasks`],
    enabled: !!boardId,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: InsertTask) => {
      return await apiRequest("POST", "/api/tasks", taskData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/boards/${boardId}/tasks`] });
      setCreateTaskOpen(false);
      toast({
        title: "Tarea creada",
        description: "La tarea se ha creado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la tarea.",
        variant: "destructive",
      });
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, columnId }: { taskId: string; columnId: string }) => {
      return await apiRequest("PATCH", `/api/tasks/${taskId}/column`, { columnId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/boards/${boardId}/tasks`] });
      toast({
        title: "Tarea movida",
        description: "La tarea se ha movido correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo mover la tarea.",
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/boards/${boardId}/tasks`] });
      toast({
        title: "Tarea eliminada",
        description: "La tarea se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la tarea.",
        variant: "destructive",
      });
    },
  });

  const handleTaskMove = (taskId: string, newColumnId: string) => {
    moveTaskMutation.mutate({ taskId, columnId: newColumnId });
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  };

  const handleTaskClose = () => {
    setTaskDetailOpen(false);
  };

  const handleTaskDelete = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
  };

  const handleCreateTask = (taskData: InsertTask) => {
    if (!board) {
      toast({
        title: "Error",
        description: "No se pudo cargar la información del tablero. Intenta de nuevo.",
        variant: "destructive",
      });
      return;
    }
    
    createTaskMutation.mutate({
      ...taskData,
      projectId: board.projectId,
    });
  };

  if (boardLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="grid gap-6 grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Tablero no encontrado</h2>
          <p className="text-muted-foreground mb-4">
            El tablero que buscas no existe o no tienes acceso a él.
          </p>
          <Button onClick={() => setLocation("/projects")} data-testid="button-back-to-projects">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Proyectos
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(`/projects/${board.projectId}/boards`)}
            data-testid="button-back-to-boards"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="board-title">{board.name}</h1>
            {board.description && (
              <p className="text-sm text-muted-foreground mt-1">{board.description}</p>
            )}
          </div>
          <Button
            onClick={() => setCreateTaskOpen(true)}
            disabled={!board || boardLoading}
            data-testid="button-create-task"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Tarea
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        {columnsLoading || tasksLoading ? (
          <div className="grid gap-6 h-full" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Skeleton className="h-full" />
            <Skeleton className="h-full" />
            <Skeleton className="h-full" />
          </div>
        ) : columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg">
            <Settings className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No hay columnas configuradas</h2>
            <p className="text-muted-foreground mb-4">
              Configura las columnas de tu tablero para comenzar a organizar tareas.
            </p>
          </div>
        ) : (
          <KanbanBoard
            tasks={tasks}
            columns={columns}
            onTaskMove={handleTaskMove}
            onTaskClick={handleTaskClick}
          />
        )}
      </div>

      {board && (
        <CreateTaskDialog
          open={createTaskOpen}
          onOpenChange={setCreateTaskOpen}
          onSubmit={handleCreateTask}
          isPending={createTaskMutation.isPending}
          userId={user?.id}
          testIdPrefix="board-view"
          projectId={board.projectId}
        />
      )}

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          open={taskDetailOpen}
          onClose={handleTaskClose}
          onDelete={handleTaskDelete}
        />
      )}
    </div>
  );
}
