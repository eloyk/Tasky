import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, AlertCircle, Users, Plus, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TeamsPage from "./teams";

interface Project {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  teamCount: number;
}

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

interface Board {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  project: {
    id: string;
    name: string;
  };
  teamCount: number;
}

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

export default function Admin() {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectPermissionsOpen, setProjectPermissionsOpen] = useState(false);
  const [addProjectTeamOpen, setAddProjectTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedPermission, setSelectedPermission] = useState<string>("view");
  
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [boardPermissionsOpen, setBoardPermissionsOpen] = useState(false);
  const [addBoardTeamOpen, setAddBoardTeamOpen] = useState(false);
  const [selectedBoardTeamId, setSelectedBoardTeamId] = useState<string>("");
  const [selectedBoardPermission, setSelectedBoardPermission] = useState<string>("view");

  const { data: currentUser, isLoading } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    enabled: !!currentUser,
  });

  const { data: projectTeams = [] } = useQuery<ProjectTeam[]>({
    queryKey: ['/api/projects', selectedProject?.id, 'teams'],
    enabled: !!selectedProject && projectPermissionsOpen,
  });

  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ['/api/organizations', currentUser?.organizationId, 'teams'],
    enabled: !!currentUser?.organizationId && (addProjectTeamOpen || addBoardTeamOpen),
  });

  const { data: boards = [] } = useQuery<Board[]>({
    queryKey: ['/api/boards'],
    enabled: !!currentUser,
  });

  const { data: boardTeams = [] } = useQuery<BoardTeam[]>({
    queryKey: ['/api/boards', selectedBoard?.id, 'teams'],
    enabled: !!selectedBoard && boardPermissionsOpen,
  });

  const addProjectTeamMutation = useMutation({
    mutationFn: async ({ projectId, teamId, permission }: { projectId: string; teamId: string; permission: string }) => {
      return await apiRequest('POST', `/api/projects/${projectId}/teams`, { teamId, permission });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setAddProjectTeamOpen(false);
      setSelectedTeamId("");
      setSelectedPermission("view");
      toast({
        title: "Equipo agregado",
        description: "El equipo se ha agregado al proyecto correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el equipo",
        variant: "destructive",
      });
    },
  });

  const removeProjectTeamMutation = useMutation({
    mutationFn: async ({ projectId, teamId }: { projectId: string; teamId: string }) => {
      return await apiRequest('DELETE', `/api/projects/${projectId}/teams/${teamId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Equipo eliminado",
        description: "El equipo se ha eliminado del proyecto correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el equipo",
        variant: "destructive",
      });
    },
  });

  const addBoardTeamMutation = useMutation({
    mutationFn: async ({ boardId, teamId, permission }: { boardId: string; teamId: string; permission: string }) => {
      return await apiRequest('POST', `/api/boards/${boardId}/teams`, { teamId, permission });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/boards', variables.boardId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/boards'] });
      setAddBoardTeamOpen(false);
      setSelectedBoardTeamId("");
      setSelectedBoardPermission("view");
      toast({
        title: "Equipo agregado",
        description: "El equipo se ha agregado al tablero correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el equipo",
        variant: "destructive",
      });
    },
  });

  const removeBoardTeamMutation = useMutation({
    mutationFn: async ({ boardId, teamId }: { boardId: string; teamId: string }) => {
      return await apiRequest('DELETE', `/api/boards/${boardId}/teams/${teamId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/boards', variables.boardId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/boards'] });
      toast({
        title: "Equipo eliminado",
        description: "El equipo se ha eliminado del tablero correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el equipo",
        variant: "destructive",
      });
    },
  });

  const availableProjectTeams = allTeams.filter(
    team => !projectTeams.some(pt => pt.teamId === team.id)
  );

  const availableBoardTeams = allTeams.filter(
    team => !boardTeams.some(bt => bt.teamId === team.id)
  );

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case 'view': return 'Ver';
      case 'edit': return 'Editar';
      case 'admin': return 'Admin';
      default: return permission;
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-12 w-64 mb-8" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Verificar que el usuario es admin o owner
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No tienes permisos para acceder a esta página. Solo los administradores pueden ver el Centro de Control.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Centro de Control</h1>
        </div>
        <p className="text-muted-foreground">
          Gestiona tu organización, equipos, proyectos y permisos desde un solo lugar.
        </p>
      </div>

      <Tabs defaultValue="teams" className="space-y-4">
        <TabsList>
          <TabsTrigger value="organization" data-testid="tab-organization">
            Organización
          </TabsTrigger>
          <TabsTrigger value="teams" data-testid="tab-teams">
            Equipos
          </TabsTrigger>
          <TabsTrigger value="projects" data-testid="tab-projects">
            Proyectos
          </TabsTrigger>
          <TabsTrigger value="boards" data-testid="tab-boards">
            Tableros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Información de la Organización</CardTitle>
              <CardDescription>
                Configuración general de tu organización
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Próximamente...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          <TeamsPage />
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Proyectos y Permisos</CardTitle>
              <CardDescription>
                Gestiona todos los proyectos y sus permisos de equipos desde un solo lugar
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay proyectos creados todavía. Crea uno desde la página de Proyectos.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Equipos asignados</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {project.description || "Sin descripción"}
                        </TableCell>
                        <TableCell>
                          {project.teamCount === 0 ? (
                            <Badge variant="secondary" className="gap-1">
                              <Users className="h-3 w-3" />
                              Acceso abierto
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Users className="h-3 w-3" />
                              {project.teamCount} equipo{project.teamCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedProject(project);
                              setProjectPermissionsOpen(true);
                            }}
                            data-testid={`button-manage-project-${project.id}`}
                          >
                            Gestionar permisos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Diálogo de permisos de proyecto */}
          <Dialog open={projectPermissionsOpen} onOpenChange={setProjectPermissionsOpen}>
            <DialogContent className="max-w-2xl" data-testid="dialog-project-permissions">
              <DialogHeader>
                <DialogTitle>Permisos del proyecto: {selectedProject?.name}</DialogTitle>
                <DialogDescription>
                  Gestiona qué equipos tienen acceso a este proyecto y sus permisos
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {projectTeams.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No hay equipos asignados a este proyecto. Todos los miembros de la organización tienen acceso.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {projectTeams.map((pt) => (
                      <div key={pt.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: pt.team.color || "#3b82f6" }}
                          />
                          <div>
                            <p className="font-medium">{pt.team.name}</p>
                            <p className="text-sm text-muted-foreground">{pt.team.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{getPermissionLabel(pt.permission)}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProjectTeamMutation.mutate({ 
                              projectId: selectedProject!.id, 
                              teamId: pt.teamId 
                            })}
                            disabled={removeProjectTeamMutation.isPending}
                            data-testid={`button-remove-project-team-${pt.teamId}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => setAddProjectTeamOpen(true)}
                  data-testid="button-add-project-team"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar equipo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Diálogo para agregar equipo al proyecto */}
          <Dialog open={addProjectTeamOpen} onOpenChange={setAddProjectTeamOpen}>
            <DialogContent data-testid="dialog-add-project-team">
              <DialogHeader>
                <DialogTitle>Agregar equipo al proyecto</DialogTitle>
                <DialogDescription>
                  Selecciona un equipo y el nivel de permiso
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Equipo</Label>
                  <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                    <SelectTrigger data-testid="select-team">
                      <SelectValue placeholder="Selecciona un equipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProjectTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Permiso</Label>
                  <Select value={selectedPermission} onValueChange={setSelectedPermission}>
                    <SelectTrigger data-testid="select-permission">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">Ver</SelectItem>
                      <SelectItem value="edit">Editar</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddProjectTeamOpen(false)}
                  data-testid="button-cancel-add-team"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => addProjectTeamMutation.mutate({ 
                    projectId: selectedProject!.id,
                    teamId: selectedTeamId, 
                    permission: selectedPermission 
                  })}
                  disabled={!selectedTeamId || addProjectTeamMutation.isPending}
                  data-testid="button-confirm-add-team"
                >
                  {addProjectTeamMutation.isPending ? "Agregando..." : "Agregar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="boards" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tableros y Permisos</CardTitle>
              <CardDescription>
                Gestiona todos los tableros y sus permisos de equipos desde un solo lugar
              </CardDescription>
            </CardHeader>
            <CardContent>
              {boards.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay tableros creados todavía. Crea uno desde la página de Proyectos.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tablero</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Equipos asignados</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boards.map((board) => (
                      <TableRow key={board.id}>
                        <TableCell className="font-medium">{board.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {board.project.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {board.description || "Sin descripción"}
                        </TableCell>
                        <TableCell>
                          {board.teamCount === 0 ? (
                            <Badge variant="secondary" className="gap-1">
                              <Users className="h-3 w-3" />
                              Acceso abierto
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Users className="h-3 w-3" />
                              {board.teamCount} equipo{board.teamCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedBoard(board);
                              setBoardPermissionsOpen(true);
                            }}
                            data-testid={`button-manage-board-${board.id}`}
                          >
                            Gestionar permisos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Diálogo de permisos de tablero */}
          <Dialog open={boardPermissionsOpen} onOpenChange={setBoardPermissionsOpen}>
            <DialogContent className="max-w-2xl" data-testid="dialog-board-permissions">
              <DialogHeader>
                <DialogTitle>Permisos del tablero: {selectedBoard?.name}</DialogTitle>
                <DialogDescription>
                  Gestiona qué equipos tienen acceso a este tablero y sus permisos
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {boardTeams.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No hay equipos asignados a este tablero. Todos los miembros del proyecto tienen acceso.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {boardTeams.map((bt) => (
                      <div key={bt.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: bt.team.color || "#3b82f6" }}
                          />
                          <div>
                            <p className="font-medium">{bt.team.name}</p>
                            <p className="text-sm text-muted-foreground">{bt.team.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{getPermissionLabel(bt.permission)}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBoardTeamMutation.mutate({ 
                              boardId: selectedBoard!.id, 
                              teamId: bt.teamId 
                            })}
                            disabled={removeBoardTeamMutation.isPending}
                            data-testid={`button-remove-board-team-${bt.teamId}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => setAddBoardTeamOpen(true)}
                  data-testid="button-add-board-team"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar equipo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Diálogo para agregar equipo al tablero */}
          <Dialog open={addBoardTeamOpen} onOpenChange={setAddBoardTeamOpen}>
            <DialogContent data-testid="dialog-add-board-team">
              <DialogHeader>
                <DialogTitle>Agregar equipo al tablero</DialogTitle>
                <DialogDescription>
                  Selecciona un equipo y el nivel de permiso
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Equipo</Label>
                  <Select value={selectedBoardTeamId} onValueChange={setSelectedBoardTeamId}>
                    <SelectTrigger data-testid="select-board-team">
                      <SelectValue placeholder="Selecciona un equipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBoardTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Permiso</Label>
                  <Select value={selectedBoardPermission} onValueChange={setSelectedBoardPermission}>
                    <SelectTrigger data-testid="select-board-permission">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">Ver</SelectItem>
                      <SelectItem value="edit">Editar</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddBoardTeamOpen(false)}
                  data-testid="button-cancel-add-board-team"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => addBoardTeamMutation.mutate({ 
                    boardId: selectedBoard!.id,
                    teamId: selectedBoardTeamId, 
                    permission: selectedBoardPermission 
                  })}
                  disabled={!selectedBoardTeamId || addBoardTeamMutation.isPending}
                  data-testid="button-confirm-add-board-team"
                >
                  {addBoardTeamMutation.isPending ? "Agregando..." : "Agregar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
