import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Users, Edit, Trash2, UserPlus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const teamFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  description: z.string().optional(),
  color: z.string().optional(),
});

type TeamFormValues = z.infer<typeof teamFormSchema>;

interface Team {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

interface OrganizationMember {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

export default function TeamsPage() {
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/organizations', currentUser?.organizationId, 'teams'],
    enabled: !!currentUser?.organizationId,
  });

  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ['/api/teams', selectedTeam?.id, 'members'],
    enabled: !!selectedTeam?.id && isMembersOpen,
  });

  const { data: orgMembers } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/organizations', currentUser?.organizationId, 'members'],
    enabled: !!currentUser?.organizationId && isAddMemberOpen,
  });

  const createForm = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3b82f6",
    },
  });

  const editForm = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3b82f6",
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: TeamFormValues) => {
      return await apiRequest('POST', '/api/teams', {
        ...data,
        organizationId: currentUser?.organizationId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentUser?.organizationId, 'teams'] });
      setIsCreateOpen(false);
      createForm.reset();
      toast({
        title: "Equipo creado",
        description: "El equipo se ha creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el equipo",
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: TeamFormValues) => {
      return await apiRequest('PUT', `/api/teams/${selectedTeam?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentUser?.organizationId, 'teams'] });
      setIsEditOpen(false);
      setSelectedTeam(null);
      toast({
        title: "Equipo actualizado",
        description: "El equipo se ha actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el equipo",
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/teams/${selectedTeam?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentUser?.organizationId, 'teams'] });
      setIsDeleteOpen(false);
      setSelectedTeam(null);
      toast({
        title: "Equipo eliminado",
        description: "El equipo se ha eliminado correctamente.",
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

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('POST', `/api/teams/${selectedTeam?.id}/members`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', selectedTeam?.id, 'members'] });
      toast({
        title: "Miembro agregado",
        description: "El miembro se ha agregado al equipo correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el miembro",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('DELETE', `/api/teams/${selectedTeam?.id}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', selectedTeam?.id, 'members'] });
      toast({
        title: "Miembro eliminado",
        description: "El miembro se ha eliminado del equipo correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el miembro",
        variant: "destructive",
      });
    },
  });

  const handleOpenEdit = (team: Team) => {
    setSelectedTeam(team);
    editForm.reset({
      name: team.name,
      description: team.description || "",
      color: team.color || "#3b82f6",
    });
    setIsEditOpen(true);
  };

  const handleOpenDelete = (team: Team) => {
    setSelectedTeam(team);
    setIsDeleteOpen(true);
  };

  const handleOpenMembers = (team: Team) => {
    setSelectedTeam(team);
    setIsMembersOpen(true);
  };

  const handleOpenAddMember = () => {
    setIsAddMemberOpen(true);
  };

  const handleAddMember = (userId: string) => {
    addMemberMutation.mutate(userId);
    setIsAddMemberOpen(false);
  };

  const availableMembers = orgMembers?.filter(
    (orgMember) => !teamMembers?.some((teamMember) => teamMember.userId === orgMember.userId)
  ) || [];

  const getUserDisplayName = (user: any) => {
    if (!user) return "Usuario desconocido";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email || "Usuario sin email";
  };

  const getUserInitials = (user: any) => {
    if (!user) return "?";
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email && user.email.length > 0) {
      return user.email[0].toUpperCase();
    }
    return "?";
  };

  if (teamsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-teams" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-teams">Equipos</h1>
            <p className="text-muted-foreground mt-2">
              Organiza usuarios en equipos para asignarlos a tableros y proyectos
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-team">
                <Plus className="h-4 w-4 mr-2" />
                Crear equipo
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-create-team">
              <DialogHeader>
                <DialogTitle>Crear nuevo equipo</DialogTitle>
                <DialogDescription>
                  Los equipos te permiten agrupar usuarios y asignarlos a tableros o proyectos
                </DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit((data) => createTeamMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del equipo</FormLabel>
                        <FormControl>
                          <Input placeholder="Desarrollo" {...field} data-testid="input-team-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Equipo de desarrollo de software"
                            {...field}
                            data-testid="input-team-description"
                          />
                        </FormControl>
                        <FormDescription>Opcional</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input type="color" {...field} className="w-20 h-10" data-testid="input-team-color" />
                            <Input value={field.value} onChange={field.onChange} placeholder="#3b82f6" />
                          </div>
                        </FormControl>
                        <FormDescription>Color para identificar visualmente el equipo</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                      data-testid="button-cancel-create"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createTeamMutation.isPending}
                      data-testid="button-submit-create"
                    >
                      {createTeamMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Crear equipo
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {teams && teams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay equipos</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crea tu primer equipo para organizar usuarios
              </p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-team">
                <Plus className="h-4 w-4 mr-2" />
                Crear equipo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams?.map((team) => (
              <Card key={team.id} className="hover-elevate" data-testid={`card-team-${team.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {team.color && (
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: team.color }}
                        />
                      )}
                      <CardTitle className="truncate" data-testid={`text-team-name-${team.id}`}>
                        {team.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenEdit(team)}
                        data-testid={`button-edit-team-${team.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenDelete(team)}
                        data-testid={`button-delete-team-${team.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {team.description && (
                    <CardDescription className="line-clamp-2" data-testid={`text-team-description-${team.id}`}>
                      {team.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenMembers(team)}
                    className="w-full"
                    data-testid={`button-manage-members-${team.id}`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Gestionar miembros
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent data-testid="dialog-edit-team">
            <DialogHeader>
              <DialogTitle>Editar equipo</DialogTitle>
              <DialogDescription>
                Actualiza la información del equipo
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit((data) => updateTeamMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del equipo</FormLabel>
                      <FormControl>
                        <Input placeholder="Desarrollo" {...field} data-testid="input-edit-team-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Equipo de desarrollo de software"
                          {...field}
                          data-testid="input-edit-team-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input type="color" {...field} className="w-20 h-10" data-testid="input-edit-team-color" />
                          <Input value={field.value} onChange={field.onChange} placeholder="#3b82f6" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditOpen(false)}
                    data-testid="button-cancel-edit"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateTeamMutation.isPending}
                    data-testid="button-submit-edit"
                  >
                    {updateTeamMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Guardar cambios
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent data-testid="dialog-delete-team">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar equipo?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El equipo "{selectedTeam?.name}" será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTeamMutation.mutate()}
                disabled={deleteTeamMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteTeamMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isMembersOpen} onOpenChange={setIsMembersOpen}>
          <DialogContent className="max-w-2xl" data-testid="dialog-team-members">
            <DialogHeader>
              <DialogTitle>Miembros de {selectedTeam?.name}</DialogTitle>
              <DialogDescription>
                Gestiona los usuarios que pertenecen a este equipo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenAddMember}
                className="w-full"
                data-testid="button-add-member"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Agregar miembro
              </Button>
              {teamMembers && teamMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay miembros en este equipo
                </div>
              ) : (
                <div className="space-y-2">
                  {teamMembers?.filter(member => member.user).map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-md border"
                      data-testid={`member-item-${member.userId}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.user?.profileImageUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {getUserInitials(member.user)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium" data-testid={`text-member-name-${member.userId}`}>
                            {getUserDisplayName(member.user)}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-member-email-${member.userId}`}>
                            {member.user?.email}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMemberMutation.mutate(member.userId)}
                        disabled={removeMemberMutation.isPending}
                        data-testid={`button-remove-member-${member.userId}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
          <DialogContent data-testid="dialog-add-member">
            <DialogHeader>
              <DialogTitle>Agregar miembro</DialogTitle>
              <DialogDescription>
                Selecciona un usuario de la organización para agregar al equipo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {availableMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay usuarios disponibles para agregar
                </div>
              ) : (
                availableMembers.map((orgMember) => (
                  <button
                    key={orgMember.userId}
                    onClick={() => handleAddMember(orgMember.userId)}
                    className="w-full flex items-center gap-3 p-3 rounded-md border hover-elevate text-left"
                    data-testid={`button-select-member-${orgMember.userId}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={orgMember.user.profileImageUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        {getUserInitials(orgMember.user)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {getUserDisplayName(orgMember.user)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {orgMember.user.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
