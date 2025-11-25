import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Plus, Pencil, Trash2, ShieldAlert, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Organization, InsertOrganization } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function Organizations() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Verificar si el usuario puede crear organizaciones
  const { data: permissions, isLoading: isLoadingPermissions } = useQuery<{ canCreate: boolean }>({
    queryKey: ["/api/auth/can-create-organizations"],
  });

  const canCreateOrganizations = permissions?.canCreate ?? false;

  // Redirigir si el usuario no tiene permiso
  useEffect(() => {
    if (!isLoadingPermissions && !canCreateOrganizations) {
      toast({
        title: "Acceso denegado",
        description: "No tienes permiso para acceder a esta sección.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [canCreateOrganizations, isLoadingPermissions, setLocation, toast]);

  const { data: organizations = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    enabled: canCreateOrganizations, // Solo cargar si tiene permiso
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertOrganization) => {
      return await apiRequest("POST", "/api/organizations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setCreateDialogOpen(false);
      setFormData({ name: "", description: "" });
      toast({
        title: "Organización creada",
        description: "La organización se ha creado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la organización.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertOrganization> }) => {
      return await apiRequest("PATCH", `/api/organizations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setEditDialogOpen(false);
      setSelectedOrg(null);
      setFormData({ name: "", description: "" });
      toast({
        title: "Organización actualizada",
        description: "La organización se ha actualizado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la organización.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/organizations/${id}`, {});
    },
    onSuccess: () => {
      // Invalidate all related caches to ensure orphan data is removed from UI
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setDeleteDialogOpen(false);
      setSelectedOrg(null);
      toast({
        title: "Organización eliminada",
        description: "La organización se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la organización.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      description: formData.description || null,
      ownerId: "", // Backend will set this from authenticated user
    });
  };

  const handleEdit = () => {
    if (!selectedOrg) return;
    updateMutation.mutate({
      id: selectedOrg.id,
      data: {
        name: formData.name,
        description: formData.description || null,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedOrg) return;
    deleteMutation.mutate(selectedOrg.id);
  };

  const openEditDialog = (org: Organization) => {
    setSelectedOrg(org);
    setFormData({ name: org.name, description: org.description || "" });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (org: Organization) => {
    setSelectedOrg(org);
    setDeleteDialogOpen(true);
  };

  // Mostrar pantalla de carga mientras se verifican permisos
  if (isLoadingPermissions || isLoading) {
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

  // No mostrar nada si no tiene permiso (se redirigirá automáticamente)
  if (!canCreateOrganizations) {
    return null;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Organizaciones</h1>
          <p className="text-muted-foreground mt-2">
            Gestiona tus organizaciones y sus miembros.
          </p>
        </div>
        {canCreateOrganizations && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-organization">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Organización
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nueva Organización</DialogTitle>
              <DialogDescription>
                Completa los detalles de la organización.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre de la organización"
                  data-testid="input-organization-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción de la organización (opcional)"
                  data-testid="input-organization-description"
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
        )}
      </div>

      {organizations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <Building2 className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No hay organizaciones</h2>
          <p className="text-muted-foreground mb-4">
            {canCreateOrganizations 
              ? "Crea tu primera organización para comenzar."
              : "No perteneces a ninguna organización. Contacta al administrador del sistema."}
          </p>
          {canCreateOrganizations && (
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-organization">
              <Plus className="w-4 h-4 mr-2" />
              Crear Organización
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {organizations.map((org) => (
            <Card key={org.id} data-testid={`card-organization-${org.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {org.name}
                </CardTitle>
                {org.description && (
                  <CardDescription>{org.description}</CardDescription>
                )}
              </CardHeader>
              <CardFooter className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation(`/organizations/${org.id}/members`)}
                  data-testid={`button-members-${org.id}`}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Miembros
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(org)}
                  data-testid={`button-edit-${org.id}`}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDeleteDialog(org)}
                  data-testid={`button-delete-${org.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Eliminar
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Organización</DialogTitle>
            <DialogDescription>
              Actualiza los detalles de la organización.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre de la organización"
                data-testid="input-edit-organization-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción de la organización (opcional)"
                data-testid="input-edit-organization-description"
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
              Esta acción no se puede deshacer. Se eliminará permanentemente la organización
              <strong> {selectedOrg?.name}</strong> y todos sus proyectos asociados.
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
    </div>
  );
}
