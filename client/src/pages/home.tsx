import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Kanban, Settings } from "lucide-react";
import { Link } from "wouter";
import { Task, Project, ProjectColumn } from "@shared/schema";
import { KanbanBoard } from "@/components/KanbanBoard";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import type { InsertTask } from "@shared/schema";

export default function Home() {
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { toast } = useToast();

  // Cargar proyectos del usuario
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Estado para proyecto seleccionado
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  
  // Manejar auto-selección y limpieza de proyecto seleccionado
  useEffect(() => {
    // Si no hay proyectos, limpiar selección
    if (projects.length === 0) {
      if (selectedProjectId) {
        setSelectedProjectId("");
      }
      return;
    }

    // Si el proyecto seleccionado ya no existe, limpiar y seleccionar el primero
    const currentProjectExists = projects.some(p => p.id === selectedProjectId);
    if (!currentProjectExists) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Cargar columnas del proyecto seleccionado
  const { data: columns = [], isLoading: columnsLoading } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/projects", selectedProjectId, "columns"],
    enabled: !!selectedProjectId,
  });

  // Cargar tareas filtradas por proyecto
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  // Filtrar tareas por proyecto seleccionado
  const tasks = allTasks.filter(task => task.projectId === selectedProjectId);

  const createTaskMutation = useMutation({
    mutationFn: async (data: InsertTask) => {
      return await apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: (task: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (task?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "activity"] });
      }
      toast({
        title: "Tarea creada",
        description: "La tarea se ha creado correctamente.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "No autorizado",
          description: "Redirigiendo al inicio de sesión...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "No se pudo crear la tarea.",
        variant: "destructive",
      });
    },
  });

  const updateTaskColumnMutation = useMutation({
    mutationFn: async ({ taskId, columnId }: { taskId: string; columnId: string }) => {
      await apiRequest("PATCH", `/api/tasks/${taskId}/column`, { columnId });
      return { taskId, columnId };
    },
    onMutate: async ({ taskId, columnId }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
      const previousTasks = queryClient.getQueryData<Task[]>(["/api/tasks"]);

      queryClient.setQueryData<Task[]>(["/api/tasks"], (old) =>
        old?.map((task) =>
          task.id === taskId ? { ...task, columnId } : task
        ) || []
      );

      return { previousTasks };
    },
    onError: (error: Error, _variables, context) => {
      queryClient.setQueryData(["/api/tasks"], context?.previousTasks);
      
      if (isUnauthorizedError(error)) {
        toast({
          title: "No autorizado",
          description: "Redirigiendo al inicio de sesión...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "No se pudo actualizar la columna de la tarea.",
        variant: "destructive",
      });
    },
    onSuccess: ({ taskId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "activity"] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest("DELETE", `/api/tasks/${taskId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Tarea eliminada",
        description: "La tarea se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "No autorizado",
          description: "Redirigiendo al inicio de sesión...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "No se pudo eliminar la tarea.",
        variant: "destructive",
      });
    },
  });

  const handleTaskMove = (taskId: string, newColumnId: string) => {
    updateTaskColumnMutation.mutate({ taskId, columnId: newColumnId });
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
  };

  const isLoading = projectsLoading || tasksLoading || columnsLoading;
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Selector de proyecto */}
      {projects.length > 0 && (
        <div className="border-b p-4 flex items-center gap-4">
          <Kanban className="w-5 h-5 text-muted-foreground" />
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-64" data-testid="select-project">
              <SelectValue placeholder="Selecciona un proyecto" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id} data-testid={`project-option-${project.id}`}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProject && (
            <Link href={`/projects/${selectedProjectId}/columns`}>
              <Button variant="ghost" size="sm" data-testid="button-configure-columns">
                <Settings className="w-4 h-4 mr-2" />
                Configurar Columnas
              </Button>
            </Link>
          )}
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <div className="h-full p-4 md:p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
              <Skeleton className="h-full" />
              <Skeleton className="h-full" />
              <Skeleton className="h-full" />
            </div>
          ) : projects.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <CheckCircle2 className="w-16 h-16 text-muted-foreground mx-auto" />
                <h2 className="text-2xl font-semibold">No hay proyectos</h2>
                <p className="text-muted-foreground">
                  Necesitas crear un proyecto primero para poder agregar tareas.
                </p>
                <Link href="/projects">
                  <Button data-testid="button-go-to-projects">
                    Ir a Proyectos
                  </Button>
                </Link>
              </div>
            </div>
          ) : columns.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <Settings className="w-16 h-16 text-muted-foreground mx-auto" />
                <h2 className="text-2xl font-semibold">No hay columnas configuradas</h2>
                <p className="text-muted-foreground">
                  Este proyecto no tiene columnas. Configura las columnas del tablero Kanban para comenzar.
                </p>
                <Link href={`/projects/${selectedProjectId}/columns`}>
                  <Button data-testid="button-configure-columns-empty">
                    Configurar Columnas
                  </Button>
                </Link>
              </div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <CheckCircle2 className="w-16 h-16 text-muted-foreground mx-auto" />
                <h2 className="text-2xl font-semibold">No hay tareas</h2>
                <p className="text-muted-foreground">
                  Comienza creando tu primera tarea para organizar tu trabajo.
                </p>
                <CreateTaskDialog
                  onSubmit={(data) => createTaskMutation.mutate(data)}
                  isPending={createTaskMutation.isPending}
                  userId={user?.id}
                  testIdPrefix="empty-state"
                />
              </div>
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
      </div>

      <TaskDetailPanel
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onDelete={handleDeleteTask}
      />
    </div>
  );
}
