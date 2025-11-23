import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FolderKanban, Plus, Pencil, Trash2, Users, X, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, InsertProject, Organization } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectTeam {
  id: string;
  projectId: string;
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

export default function Projects() {
  const [, setLocation] = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedPermission, setSelectedPermission] = useState<string>("view");
  const [formData, setFormData] = useState({ name: "", description: "" });
  const { toast } = useToast();

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  // Obtener la organización del usuario (siempre hay una)
  const { data: organizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  // Usar la primera (y única) organización del usuario
  const userOrg = organizations[0];

  // Obtener todos los proyectos del usuario (de su organización)
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: projectTeams = [] } = useQuery<ProjectTeam[]>({
    queryKey: ["/api/projects", selectedProject?.id, "teams"],
    enabled: !!selectedProject?.id && permissionsOpen,
  });

  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ['/api/organizations', currentUser?.organizationId, 'teams'],
    enabled: !!currentUser?.organizationId && addTeamOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      return await apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setCreateDialogOpen(false);
      setFormData({ name: "", description: "" });
      toast({
        title: "Proyecto creado",
        description: "El proyecto se ha creado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el proyecto.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertProject> }) => {
      return await apiRequest("PATCH", `/api/projects/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditDialogOpen(false);
      setSelectedProject(null);
      setFormData({ name: "", description: "" });
      toast({
        title: "Proyecto actualizado",
        description: "El proyecto se ha actualizado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el proyecto.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/projects/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDeleteDialogOpen(false);
      setSelectedProject(null);
      toast({
        title: "Proyecto eliminado",
        description: "El proyecto se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el proyecto.",
        variant: "destructive",
      });
    },
  });

  const addTeamToProjectMutation = useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      return await apiRequest("POST", `/api/projects/${projectId}/teams`, {
        teamId: selectedTeamId,
        permission: selectedPermission,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "teams"] });
      setAddTeamOpen(false);
      setSelectedTeamId("");
      setSelectedPermission("view");
      toast({
        title: "Equipo agregado",
        description: "El equipo se ha asignado al proyecto correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el equipo al proyecto.",
        variant: "destructive",
      });
    },
  });

  const removeTeamFromProjectMutation = useMutation({
    mutationFn: async ({ projectId, teamId }: { projectId: string; teamId: string }) => {
      return await apiRequest("DELETE", `/api/projects/${projectId}/teams/${teamId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "teams"] });
      toast({
        title: "Equipo eliminado",
        description: "El equipo se ha eliminado del proyecto correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el equipo del proyecto.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!userOrg) {
      toast({
        title: "Error",
        description: "No se pudo obtener la organización.",
        variant: "destructive",
      });
      return;
    }
    
    createMutation.mutate({
      name: formData.name,
      description: formData.description || null,
      organizationId: userOrg.id,
    });
  };

  const handleEdit = () => {
    if (!selectedProject) return;
    updateMutation.mutate({
      id: selectedProject.id,
      data: {
        name: formData.name,
        description: formData.description || null,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedProject) return;
    deleteMutation.mutate(selectedProject.id);
  };

  const openEditDialog = (project: Project) => {
    setSelectedProject(project);
    setFormData({ name: project.name, description: project.description || "" });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (project: Project) => {
    setSelectedProject(project);
    setDeleteDialogOpen(true);
  };

  const openPermissionsDialog = (project: Project) => {
    setSelectedProject(project);
    setPermissionsOpen(true);
  };

  if (orgsLoading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (organizations.length === 0 && !orgsLoading) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <FolderKanban className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Cargando organización...</h2>
          <p className="text-muted-foreground">
            Estamos configurando tu espacio de trabajo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Proyectos</h1>
          <p className="text-muted-foreground mt-2">
            Gestiona tus proyectos.
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!userOrg} data-testid="button-create-project">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Proyecto
            </Button>
          </DialogTrigger>
          <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nuevo Proyecto</DialogTitle>
                <DialogDescription>
                  Completa los detalles del proyecto.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nombre del proyecto"
                    data-testid="input-project-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descripción del proyecto (opcional)"
                    data-testid="input-project-description"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  data-testid="button-cancel-create"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formData.name || createMutation.isPending}
                  data-testid="button-confirm-create"
                >
                  {createMutation.isPending ? "Creando..." : "Crear"}
                </Button>
              </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projectsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <FolderKanban className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No hay proyectos</h2>
          <p className="text-muted-foreground mb-4">Crea tu primer proyecto para comenzar.</p>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-project">
            <Plus className="w-4 h-4 mr-2" />
            Crear Proyecto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} data-testid={`card-project-${project.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="w-5 h-5" />
                  {project.name}
                </CardTitle>
                {project.description && (
                  <CardDescription>{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardFooter className="flex justify-between gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setLocation(`/projects/${project.id}/boards`)}
                  data-testid={`button-open-${project.id}`}
                >
                  <FolderKanban className="w-4 h-4 mr-1" />
                  Ver Tableros
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPermissionsDialog(project)}
                    data-testid={`button-permissions-${project.id}`}
                  >
                    <Users className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(project)}
                    data-testid={`button-edit-${project.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteDialog(project)}
                    data-testid={`button-delete-${project.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Proyecto</DialogTitle>
            <DialogDescription>
              Actualiza los detalles del proyecto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre del proyecto"
                data-testid="input-edit-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción del proyecto (opcional)"
                data-testid="input-edit-project-description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              data-testid="button-cancel-edit"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEdit}
              disabled={!formData.name || updateMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending ? "Actualizando..." : "Actualizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el proyecto
              <strong> {selectedProject?.name}</strong> y todas sus tareas asociadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permissions Dialog */}
      <Dialog open={permissionsOpen} onOpenChange={setPermissionsOpen}>
        <DialogContent className="max-w-2xl">
          {!selectedProject ? (
            <div className="p-4">No hay proyecto seleccionado</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Permisos de Equipos - {selectedProject.name}</DialogTitle>
                <DialogDescription>
                  Gestiona qué equipos tienen acceso a este proyecto y sus permisos.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium">Equipos con Acceso</h3>
              <Button
                size="sm"
                onClick={() => setAddTeamOpen(true)}
                data-testid="button-add-team-to-project"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Agregar Equipo
              </Button>
            </div>

            {projectTeams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay equipos asignados. Todos los miembros de la organización tienen acceso.
              </div>
            ) : (
              <div className="space-y-2">
                {projectTeams.map((projectTeam) => (
                  <div
                    key={projectTeam.id}
                    className="flex items-center justify-between p-3 border rounded-md"
                    data-testid={`project-team-${projectTeam.team.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {projectTeam.team.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: projectTeam.team.color }}
                        />
                      )}
                      <div>
                        <div className="font-medium">{projectTeam.team.name}</div>
                        {projectTeam.team.description && (
                          <div className="text-sm text-muted-foreground">
                            {projectTeam.team.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {projectTeam.permission === 'view' && 'Ver'}
                        {projectTeam.permission === 'edit' && 'Editar'}
                        {projectTeam.permission === 'admin' && 'Admin'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTeamFromProjectMutation.mutate({ 
                          projectId: selectedProject!.id, 
                          teamId: projectTeam.teamId 
                        })}
                        disabled={removeTeamFromProjectMutation.isPending}
                        data-testid={`button-remove-team-${projectTeam.team.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </div>

              <DialogFooter>
                <Button onClick={() => setPermissionsOpen(false)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Team to Project Dialog */}
      <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
        <DialogContent>
          {!selectedProject ? (
            <div className="p-4">No hay proyecto seleccionado</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Agregar Equipo al Proyecto</DialogTitle>
                <DialogDescription>
                  Selecciona un equipo y el nivel de permiso que tendrá en este proyecto.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="team-select">Equipo</Label>
              <Select
                value={selectedTeamId}
                onValueChange={setSelectedTeamId}
              >
                <SelectTrigger id="team-select" data-testid="select-team">
                  <SelectValue placeholder="Selecciona un equipo" />
                </SelectTrigger>
                <SelectContent>
                  {allTeams
                    .filter(team => !projectTeams.some(pt => pt.teamId === team.id))
                    .map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        <div className="flex items-center gap-2">
                          {team.color && (
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                          )}
                          <span>{team.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="permission-select">Nivel de Permiso</Label>
              <Select
                value={selectedPermission}
                onValueChange={setSelectedPermission}
              >
                <SelectTrigger id="permission-select" data-testid="select-permission">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Ver - Solo lectura</SelectItem>
                  <SelectItem value="edit">Editar - Puede modificar tareas</SelectItem>
                  <SelectItem value="admin">Admin - Control total</SelectItem>
                </SelectContent>
              </Select>
            </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddTeamOpen(false);
                    setSelectedTeamId("");
                    setSelectedPermission("view");
                  }}
                  data-testid="button-cancel-add-team"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => addTeamToProjectMutation.mutate({ projectId: selectedProject.id })}
                  disabled={!selectedTeamId || addTeamToProjectMutation.isPending}
                  data-testid="button-confirm-add-team"
                >
                  {addTeamToProjectMutation.isPending ? "Agregando..." : "Agregar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
