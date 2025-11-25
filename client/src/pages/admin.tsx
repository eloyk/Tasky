import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Shield, AlertCircle, Users, Plus, X, Briefcase, LayoutGrid, Building2, ChevronRight, FolderOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  organizationId: string;
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  project: {
    id: string;
    name: string;
    organizationId: string;
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

interface Organization {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface OrganizationMember {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string;
  role: 'owner' | 'admin' | 'member';
}

interface UserOrganization {
  organizationId: string;
  organizationName: string;
  role: string;
}

export default function Admin() {
  const { toast } = useToast();
  const [location] = useLocation();
  
  const getDefaultTab = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const tab = searchParams.get('tab');
    return (tab === 'organization' || tab === 'teams' || tab === 'projects' || tab === 'boards') 
      ? tab 
      : 'teams';
  };
  
  const [activeTab, setActiveTab] = useState(getDefaultTab());
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  useEffect(() => {
    setActiveTab(getDefaultTab());
  }, [location]);
  
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

  // Get organizations where user is admin/owner
  const adminOrganizations: UserOrganization[] = currentUser?.organizations?.filter(
    (org: UserOrganization) => org.role === 'owner' || org.role === 'admin'
  ) || [];

  // Set initial organization when user data loads
  useEffect(() => {
    if (adminOrganizations.length > 0 && !selectedOrgId) {
      setSelectedOrgId(adminOrganizations[0].organizationId);
    }
  }, [adminOrganizations, selectedOrgId]);

  const { data: allProjects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    enabled: !!currentUser,
  });

  // Filter projects by selected organization
  const projects = allProjects.filter(p => p.organizationId === selectedOrgId);

  const { data: projectTeams = [] } = useQuery<ProjectTeam[]>({
    queryKey: ['/api/projects', selectedProject?.id, 'teams'],
    enabled: !!selectedProject && projectPermissionsOpen,
  });

  // Get teams for the selected organization
  const { data: orgTeams = [] } = useQuery<Team[]>({
    queryKey: ['/api/organizations', selectedOrgId, 'teams'],
    enabled: !!selectedOrgId,
  });

  const { data: allBoards = [] } = useQuery<Board[]>({
    queryKey: ['/api/boards'],
    enabled: !!currentUser,
  });

  // Filter boards by selected organization AND project
  const filteredBoards = allBoards.filter(b => {
    if (!selectedOrgId) return false;
    const matchesOrg = b.project?.organizationId === selectedOrgId;
    if (!selectedProjectId) return matchesOrg;
    return matchesOrg && b.projectId === selectedProjectId;
  });

  const { data: boardTeams = [] } = useQuery<BoardTeam[]>({
    queryKey: ['/api/boards', selectedBoard?.id, 'teams'],
    enabled: !!selectedBoard && boardPermissionsOpen,
  });

  const { data: organization } = useQuery<Organization>({
    queryKey: ['/api/organizations', selectedOrgId],
    enabled: !!selectedOrgId,
  });

  const { data: organizationMembers = [] } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/organizations', selectedOrgId, 'members'],
    enabled: !!selectedOrgId,
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

  // Filter available teams (only from same organization, not already assigned)
  const availableProjectTeams = orgTeams.filter(
    team => !projectTeams.some(pt => pt.teamId === team.id)
  );

  const availableBoardTeams = orgTeams.filter(
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

  // Group boards by project for hierarchical display
  const boardsByProject = filteredBoards.reduce((acc, board) => {
    const projectId = board.projectId;
    if (!acc[projectId]) {
      acc[projectId] = {
        project: board.project,
        boards: []
      };
    }
    acc[projectId].boards.push(board);
    return acc;
  }, {} as Record<string, { project: { id: string; name: string; organizationId: string }; boards: Board[] }>);

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-12 w-64 mb-8" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';
  const hasAdminAccess = adminOrganizations.length > 0;

  if (!isAdmin && !hasAdminAccess) {
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

  const currentOrgName = adminOrganizations.find(
    org => org.organizationId === selectedOrgId
  )?.organizationName || 'Organización';

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

      {/* Organization Selector - Always visible at the top */}
      <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium">Organización:</span>
          {adminOrganizations.length > 1 ? (
            <Select value={selectedOrgId || undefined} onValueChange={(value) => {
              setSelectedOrgId(value);
              setSelectedProjectId(null); // Reset project filter when org changes
            }}>
              <SelectTrigger className="w-[300px]" data-testid="select-organization">
                <SelectValue placeholder="Seleccionar organización" />
              </SelectTrigger>
              <SelectContent>
                {adminOrganizations.map((org) => (
                  <SelectItem key={org.organizationId} value={org.organizationId}>
                    {org.organizationName} ({org.role === 'owner' ? 'Propietario' : 'Admin'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm">{currentOrgName}</span>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="teams" data-testid="tab-teams">
            <Users className="h-4 w-4 mr-2" />
            Equipos
          </TabsTrigger>
          <TabsTrigger value="projects" data-testid="tab-projects">
            <Briefcase className="h-4 w-4 mr-2" />
            Proyectos
          </TabsTrigger>
          <TabsTrigger value="boards" data-testid="tab-boards">
            <LayoutGrid className="h-4 w-4 mr-2" />
            Tableros
          </TabsTrigger>
          <TabsTrigger value="organization" data-testid="tab-organization">
            <Building2 className="h-4 w-4 mr-2" />
            Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="space-y-4">
          <TeamsPage organizationId={selectedOrgId} hideOrgSelector />
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Proyectos de {currentOrgName}
              </CardTitle>
              <CardDescription>
                Gestiona qué equipos tienen acceso a cada proyecto. Solo se muestran equipos de esta organización.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No hay proyectos en esta organización.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Acceso</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">
                          {project.description || "Sin descripción"}
                        </TableCell>
                        <TableCell>
                          {project.teamCount === 0 ? (
                            <Badge variant="secondary" className="gap-1">
                              <Users className="h-3 w-3" />
                              Todos los miembros
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
                            Gestionar equipos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Project permissions dialog */}
          <Dialog open={projectPermissionsOpen} onOpenChange={setProjectPermissionsOpen}>
            <DialogContent className="max-w-2xl" data-testid="dialog-project-permissions">
              <DialogHeader>
                <DialogTitle>Equipos del proyecto: {selectedProject?.name}</DialogTitle>
                <DialogDescription>
                  Solo se muestran equipos de la organización {currentOrgName}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {projectTeams.length === 0 ? (
                  <div className="text-center py-6 bg-muted/30 rounded-lg">
                    <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                      Sin equipos asignados. Todos los miembros de la organización tienen acceso.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projectTeams.filter(pt => pt.team).map((pt) => (
                      <div key={pt.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: pt.team?.color || "#3b82f6" }}
                          />
                          <div>
                            <p className="font-medium">{pt.team?.name}</p>
                            {pt.team?.description && (
                              <p className="text-sm text-muted-foreground">{pt.team.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{getPermissionLabel(pt.permission)}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
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
                  disabled={availableProjectTeams.length === 0}
                  data-testid="button-add-project-team"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar equipo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add team to project dialog */}
          <Dialog open={addProjectTeamOpen} onOpenChange={setAddProjectTeamOpen}>
            <DialogContent data-testid="dialog-add-project-team">
              <DialogHeader>
                <DialogTitle>Agregar equipo al proyecto</DialogTitle>
                <DialogDescription>
                  Equipos disponibles en {currentOrgName}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {availableProjectTeams.length === 0 ? (
                  <div className="text-center py-6 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground">
                      No hay más equipos disponibles en esta organización.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Equipo</Label>
                      <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                        <SelectTrigger data-testid="select-project-team">
                          <SelectValue placeholder="Selecciona un equipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProjectTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: team.color || "#3b82f6" }}
                                />
                                {team.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Permiso</Label>
                      <Select value={selectedPermission} onValueChange={setSelectedPermission}>
                        <SelectTrigger data-testid="select-project-permission">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">Ver - Solo lectura</SelectItem>
                          <SelectItem value="edit">Editar - Puede modificar</SelectItem>
                          <SelectItem value="admin">Admin - Control total</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddProjectTeamOpen(false)}
                  data-testid="button-cancel-add-project-team"
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
                  data-testid="button-confirm-add-project-team"
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
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" />
                Tableros de {currentOrgName}
              </CardTitle>
              <CardDescription>
                Gestiona qué equipos tienen acceso a cada tablero. Filtra por proyecto para una vista más clara.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Project filter */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Filtrar por proyecto:</span>
                <Select 
                  value={selectedProjectId || "all"} 
                  onValueChange={(value) => setSelectedProjectId(value === "all" ? null : value)}
                >
                  <SelectTrigger className="w-[250px]" data-testid="select-project-filter">
                    <SelectValue placeholder="Todos los proyectos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proyectos</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {Object.keys(boardsByProject).length === 0 ? (
                <div className="text-center py-12">
                  <LayoutGrid className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No hay tableros {selectedProjectId ? 'en este proyecto' : 'en esta organización'}.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(boardsByProject).map(([projectId, { project, boards }]) => (
                    <Collapsible key={projectId} defaultOpen>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 bg-muted/50 rounded-lg hover-elevate">
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{project.name}</span>
                        <Badge variant="secondary" className="ml-auto">
                          {boards.length} tablero{boards.length !== 1 ? 's' : ''}
                        </Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tablero</TableHead>
                              <TableHead>Descripción</TableHead>
                              <TableHead>Acceso</TableHead>
                              <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {boards.map((board) => (
                              <TableRow key={board.id}>
                                <TableCell className="font-medium">{board.name}</TableCell>
                                <TableCell className="text-muted-foreground max-w-xs truncate">
                                  {board.description || "Sin descripción"}
                                </TableCell>
                                <TableCell>
                                  {board.teamCount === 0 ? (
                                    <Badge variant="secondary" className="gap-1">
                                      <Users className="h-3 w-3" />
                                      Acceso del proyecto
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
                                    Gestionar equipos
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Board permissions dialog */}
          <Dialog open={boardPermissionsOpen} onOpenChange={setBoardPermissionsOpen}>
            <DialogContent className="max-w-2xl" data-testid="dialog-board-permissions">
              <DialogHeader>
                <DialogTitle>Equipos del tablero: {selectedBoard?.name}</DialogTitle>
                <DialogDescription>
                  Proyecto: {selectedBoard?.project?.name} | Solo equipos de {currentOrgName}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {boardTeams.length === 0 ? (
                  <div className="text-center py-6 bg-muted/30 rounded-lg">
                    <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                      Sin equipos asignados. Hereda los permisos del proyecto.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {boardTeams.filter(bt => bt.team).map((bt) => (
                      <div key={bt.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: bt.team?.color || "#3b82f6" }}
                          />
                          <div>
                            <p className="font-medium">{bt.team?.name}</p>
                            {bt.team?.description && (
                              <p className="text-sm text-muted-foreground">{bt.team.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{getPermissionLabel(bt.permission)}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
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
                  disabled={availableBoardTeams.length === 0}
                  data-testid="button-add-board-team"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar equipo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add team to board dialog */}
          <Dialog open={addBoardTeamOpen} onOpenChange={setAddBoardTeamOpen}>
            <DialogContent data-testid="dialog-add-board-team">
              <DialogHeader>
                <DialogTitle>Agregar equipo al tablero</DialogTitle>
                <DialogDescription>
                  Equipos disponibles en {currentOrgName}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {availableBoardTeams.length === 0 ? (
                  <div className="text-center py-6 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground">
                      No hay más equipos disponibles en esta organización.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Equipo</Label>
                      <Select value={selectedBoardTeamId} onValueChange={setSelectedBoardTeamId}>
                        <SelectTrigger data-testid="select-board-team">
                          <SelectValue placeholder="Selecciona un equipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBoardTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: team.color || "#3b82f6" }}
                                />
                                {team.name}
                              </div>
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
                          <SelectItem value="view">Ver - Solo lectura</SelectItem>
                          <SelectItem value="edit">Editar - Puede modificar</SelectItem>
                          <SelectItem value="admin">Admin - Control total</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
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

        <TabsContent value="organization" className="space-y-4">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle>Información de la Organización</CardTitle>
              <CardDescription>
                Detalles generales de {currentOrgName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {organization ? (
                <>
                  <div>
                    <Label className="text-sm font-medium">Nombre</Label>
                    <p className="text-foreground mt-1">{organization.name}</p>
                  </div>
                  {organization.description && (
                    <div>
                      <Label className="text-sm font-medium">Descripción</Label>
                      <p className="text-muted-foreground mt-1">{organization.description}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm font-medium">Fecha de creación</Label>
                    <p className="text-muted-foreground mt-1">
                      {new Date(organization.createdAt).toLocaleDateString('es-ES', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                </>
              ) : (
                <Skeleton className="h-24 w-full" />
              )}
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Miembros</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{organizationMembers.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Usuarios en la organización
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Equipos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{orgTeams.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Equipos creados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Proyectos</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{projects.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Proyectos activos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tableros</CardTitle>
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredBoards.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Tableros totales
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Members list */}
          <Card>
            <CardHeader>
              <CardTitle>Miembros de la Organización</CardTitle>
              <CardDescription>
                Todos los usuarios que forman parte de {currentOrgName}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {organizationMembers.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay miembros en la organización
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizationMembers.map((member) => {
                      const userInitials = member.firstName && member.lastName
                        ? `${member.firstName[0]}${member.lastName[0]}`.toUpperCase()
                        : member.email[0].toUpperCase();
                      const userName = member.firstName && member.lastName
                        ? `${member.firstName} ${member.lastName}`
                        : member.email;
                      
                      return (
                        <TableRow key={member.userId}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{userName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.email}
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.role === 'owner' ? 'default' : member.role === 'admin' ? 'secondary' : 'outline'}>
                              {member.role === 'owner' ? 'Propietario' : member.role === 'admin' ? 'Administrador' : 'Miembro'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
