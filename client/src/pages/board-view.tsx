import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Settings, Users, X, UserPlus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Board, BoardColumn, Task, InsertTask} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KanbanBoard } from "@/components/KanbanBoard";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface BoardTeam {
  id: string;
  boardId: string;
  teamId: string;
  permission: string;
  team: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
  };
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
}

export default function BoardView() {
  const params = useParams();
  const boardId = params.id as string;
  const [, setLocation] = useLocation();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedPermission, setSelectedPermission] = useState<string>("view");
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  const { data: board, isLoading: boardLoading } = useQuery<Board>({
    queryKey: ["/api/boards", boardId],
    enabled: !!boardId,
  });

  const { data: columns = [], isLoading: columnsLoading } = useQuery<BoardColumn[]>({
    queryKey: ["/api/boards", boardId, "columns"],
    enabled: !!boardId,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: [`/api/boards/${boardId}/tasks`],
    enabled: !!boardId,
  });

  const { data: boardTeams = [] } = useQuery<BoardTeam[]>({
    queryKey: ["/api/boards", boardId, "teams"],
    enabled: !!boardId && permissionsOpen,
  });

  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ['/api/organizations', currentUser?.organizationId, 'teams'],
    enabled: !!currentUser?.organizationId && addTeamOpen,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: InsertTask) => {
      return await apiRequest("POST", "/api/tasks", taskData);
    },
    onMutate: async (newTask) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/boards/${boardId}/tasks`] });

      // Snapshot previous value (deep clone to ensure safe rollback)
      const cachedTasks = queryClient.getQueryData<Task[]>([`/api/boards/${boardId}/tasks`]) || [];
      const previousTasks = JSON.parse(JSON.stringify(cachedTasks));

      // Optimistically update to the new value
      const now = new Date().toISOString();
      const optimisticTask = {
        id: `temp-${Date.now()}`,
        title: newTask.title,
        description: newTask.description || null,
        boardId: newTask.boardId,
        columnId: newTask.columnId,
        priority: newTask.priority,
        dueDate: newTask.dueDate || null,
        projectId: newTask.projectId,
        assigneeId: newTask.assigneeId || null,
        createdById: user?.id || "",
        createdAt: now,
        updatedAt: now,
      } as unknown as Task;
      
      queryClient.setQueryData<Task[]>(
        [`/api/boards/${boardId}/tasks`],
        [...previousTasks, optimisticTask]
      );

      return { previousTasks };
    },
    onError: (error: Error, newTask, context) => {
      // Rollback to previous value
      if (context?.previousTasks) {
        queryClient.setQueryData([`/api/boards/${boardId}/tasks`], context.previousTasks);
      }
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la tarea.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setCreateTaskOpen(false);
      toast({
        title: "Tarea creada",
        description: "La tarea se ha creado correctamente.",
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: [`/api/boards/${boardId}/tasks`] });
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, columnId }: { taskId: string; columnId: string }) => {
      return await apiRequest("PATCH", `/api/tasks/${taskId}/column`, { columnId });
    },
    onMutate: async ({ taskId, columnId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/boards/${boardId}/tasks`] });

      // Snapshot previous value (deep clone to ensure safe rollback)
      const cachedTasks = queryClient.getQueryData<Task[]>([`/api/boards/${boardId}/tasks`]) || [];
      const previousTasks = JSON.parse(JSON.stringify(cachedTasks));

      // Optimistically update task's column and timestamp
      const now = new Date().toISOString();
      const updatedTasks = previousTasks.map((task: Task) =>
        task.id === taskId 
          ? { ...task, columnId, updatedAt: now as any } 
          : task
      );
      queryClient.setQueryData<Task[]>([`/api/boards/${boardId}/tasks`], updatedTasks);

      return { previousTasks };
    },
    onError: (error: Error, variables, context) => {
      // Rollback to previous value
      if (context?.previousTasks) {
        queryClient.setQueryData([`/api/boards/${boardId}/tasks`], context.previousTasks);
      }
      toast({
        title: "Error",
        description: error.message || "No se pudo mover la tarea.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Tarea movida",
        description: "La tarea se ha movido correctamente.",
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: [`/api/boards/${boardId}/tasks`] });
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

  const addTeamToBoardMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/boards/${boardId}/teams`, {
        teamId: selectedTeamId,
        permission: selectedPermission,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", boardId, "teams"] });
      setAddTeamOpen(false);
      setSelectedTeamId("");
      setSelectedPermission("view");
      toast({
        title: "Equipo agregado",
        description: "El equipo se ha asignado al tablero correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el equipo al tablero.",
        variant: "destructive",
      });
    },
  });

  const removeTeamFromBoardMutation = useMutation({
    mutationFn: async (teamId: string) => {
      return await apiRequest("DELETE", `/api/boards/${boardId}/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", boardId, "teams"] });
      toast({
        title: "Equipo eliminado",
        description: "El equipo se ha eliminado del tablero correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el equipo del tablero.",
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPermissionsOpen(true)}
              disabled={!board || boardLoading}
              data-testid="button-board-permissions"
            >
              <Users className="w-4 h-4 mr-2" />
              Permisos
            </Button>
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
          boardId={board.id}
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

      <Dialog open={permissionsOpen} onOpenChange={setPermissionsOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-board-permissions">
          <DialogHeader>
            <DialogTitle>Permisos del Tablero</DialogTitle>
            <DialogDescription>
              Gestiona qué equipos tienen acceso a este tablero y sus niveles de permiso
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddTeamOpen(true)}
              className="w-full"
              data-testid="button-add-team-to-board"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Agregar equipo
            </Button>
            {boardTeams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay equipos asignados a este tablero. Todos los miembros de la organización pueden acceder.
              </div>
            ) : (
              <div className="space-y-2">
                {boardTeams.map((boardTeam) => (
                  <div
                    key={boardTeam.id}
                    className="flex items-center justify-between p-3 rounded-md border"
                    data-testid={`board-team-item-${boardTeam.teamId}`}
                  >
                    <div className="flex items-center gap-3">
                      {boardTeam.team.color && (
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: boardTeam.team.color }}
                        />
                      )}
                      <div>
                        <p className="text-sm font-medium" data-testid={`text-team-name-${boardTeam.teamId}`}>
                          {boardTeam.team.name}
                        </p>
                        {boardTeam.team.description && (
                          <p className="text-xs text-muted-foreground">
                            {boardTeam.team.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" data-testid={`badge-permission-${boardTeam.teamId}`}>
                        {boardTeam.permission === 'view' && 'Ver'}
                        {boardTeam.permission === 'edit' && 'Editar'}
                        {boardTeam.permission === 'admin' && 'Admin'}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeTeamFromBoardMutation.mutate(boardTeam.teamId)}
                        disabled={removeTeamFromBoardMutation.isPending}
                        data-testid={`button-remove-team-${boardTeam.teamId}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
        <DialogContent data-testid="dialog-add-team-to-board">
          <DialogHeader>
            <DialogTitle>Agregar equipo al tablero</DialogTitle>
            <DialogDescription>
              Selecciona un equipo y el nivel de permiso para este tablero
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Equipo</label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger data-testid="select-team">
                  <SelectValue placeholder="Selecciona un equipo" />
                </SelectTrigger>
                <SelectContent>
                  {allTeams
                    .filter((team) => !boardTeams.some((bt) => bt.teamId === team.id))
                    .map((team) => (
                      <SelectItem key={team.id} value={team.id} data-testid={`select-team-option-${team.id}`}>
                        <div className="flex items-center gap-2">
                          {team.color && (
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                          )}
                          {team.name}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nivel de permiso</label>
              <Select value={selectedPermission} onValueChange={setSelectedPermission}>
                <SelectTrigger data-testid="select-permission">
                  <SelectValue placeholder="Selecciona el nivel de permiso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Ver - Solo lectura</SelectItem>
                  <SelectItem value="edit">Editar - Crear y modificar tareas</SelectItem>
                  <SelectItem value="admin">Admin - Gestión completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => addTeamToBoardMutation.mutate()}
              disabled={!selectedTeamId || addTeamToBoardMutation.isPending}
              className="w-full"
              data-testid="button-submit-add-team"
            >
              {addTeamToBoardMutation.isPending && (
                <Settings className="h-4 w-4 animate-spin mr-2" />
              )}
              Agregar equipo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
