import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, UserPlus, Trash2, Shield, Users as UsersIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

interface OrganizationMember {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username: string;
  role: 'owner' | 'admin' | 'member';
}

export default function OrganizationMembers() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const { toast } = useToast();

  // Get organization details
  const { data: organization, isLoading: isLoadingOrg } = useQuery({
    queryKey: ["/api/organizations", id],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${id}`);
      if (!response.ok) throw new Error("Failed to fetch organization");
      return response.json();
    },
  });

  // Get current organization members
  const { data: members = [], isLoading: isLoadingMembers } = useQuery<OrganizationMember[]>({
    queryKey: ["/api/organizations", id, "members"],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${id}/members`);
      if (!response.ok) throw new Error("Failed to fetch members");
      return response.json();
    },
  });

  // Get all Keycloak users (for adding new members)
  const { data: keycloakUsers = [], isLoading: isLoadingUsers } = useQuery<KeycloakUser[]>({
    queryKey: ["/api/keycloak/users"],
    enabled: addMemberDialogOpen,
  });

  // Filter out users who are already members
  const availableUsers = keycloakUsers.filter(
    user => !members.some(member => member.userId === user.id)
  );

  const addMemberMutation = useMutation({
    mutationFn: async (data: { keycloakUserId: string; role: string }) => {
      return await apiRequest("POST", `/api/organizations/${id}/members`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", id, "members"] });
      setAddMemberDialogOpen(false);
      setSelectedUser("");
      setSelectedRole("member");
      toast({
        title: "Miembro agregado",
        description: "El usuario ha sido agregado a la organización.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el miembro.",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/organizations/${id}/members/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", id, "members"] });
      setRemoveMemberDialogOpen(false);
      setMemberToRemove(null);
      toast({
        title: "Miembro removido",
        description: "El usuario ha sido removido de la organización.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo remover el miembro.",
        variant: "destructive",
      });
    },
  });

  const handleAddMember = () => {
    if (!selectedUser || !selectedRole) return;
    addMemberMutation.mutate({
      keycloakUserId: selectedUser,
      role: selectedRole,
    });
  };

  const handleRemoveMember = () => {
    if (!memberToRemove) return;
    removeMemberMutation.mutate(memberToRemove.userId);
  };

  const openRemoveDialog = (member: OrganizationMember) => {
    setMemberToRemove(member);
    setRemoveMemberDialogOpen(true);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Propietario';
      case 'admin':
        return 'Administrador';
      default:
        return 'Miembro';
    }
  };

  const getInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  if (isLoadingOrg || isLoadingMembers) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Organización no encontrada</h2>
          <Button onClick={() => setLocation("/organizations")} data-testid="button-back">
            Volver a Organizaciones
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Button
          variant="outline"
          onClick={() => setLocation("/organizations")}
          className="mb-4"
          data-testid="button-back-to-orgs"
        >
          ← Volver a Organizaciones
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-6 h-6" />
              <h1 className="text-3xl font-bold">{organization.name}</h1>
            </div>
            <p className="text-muted-foreground">
              Gestiona los miembros de esta organización
            </p>
          </div>
          <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-member">
                <UserPlus className="w-4 h-4 mr-2" />
                Agregar Miembro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar Miembro a la Organización</DialogTitle>
                <DialogDescription>
                  Selecciona un usuario de Keycloak y asigna su rol en la organización.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="user">Usuario</Label>
                  {isLoadingUsers ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger id="user" data-testid="select-user">
                        <SelectValue placeholder="Seleccionar usuario" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUsers.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            No hay usuarios disponibles
                          </div>
                        ) : (
                          availableUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.email} {user.firstName && user.lastName && `(${user.firstName} ${user.lastName})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rol</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger id="role" data-testid="select-role">
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Propietario</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="member">Miembro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddMemberDialogOpen(false)}
                  data-testid="button-cancel-add"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddMember}
                  disabled={!selectedUser || addMemberMutation.isPending}
                  data-testid="button-confirm-add"
                >
                  {addMemberMutation.isPending ? "Agregando..." : "Agregar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5" />
            Miembros ({members.length})
          </CardTitle>
          <CardDescription>
            Usuarios con acceso a esta organización
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay miembros en esta organización
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between p-4 rounded-lg border"
                  data-testid={`member-${member.userId}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {getInitials(member.firstName, member.lastName, member.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {member.firstName && member.lastName
                          ? `${member.firstName} ${member.lastName}`
                          : member.username}
                      </div>
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      {getRoleLabel(member.role)}
                    </Badge>
                    {member.role !== 'owner' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openRemoveDialog(member)}
                        data-testid={`button-remove-${member.userId}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removeMemberDialogOpen} onOpenChange={setRemoveMemberDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Remover miembro?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres remover a {memberToRemove?.email} de la organización?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={removeMemberMutation.isPending}
              data-testid="button-confirm-remove"
            >
              {removeMemberMutation.isPending ? "Removiendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
