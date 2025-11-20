import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { useRoute } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectColumn } from "@shared/schema";
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
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectColumns() {
  const [, params] = useRoute("/projects/:id/columns");
  const projectId = params?.id || "";
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<ProjectColumn | null>(null);
  const [columnName, setColumnName] = useState("");
  const { toast } = useToast();

  const { data: columns = [], isLoading } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/projects", projectId, "columns"],
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest("POST", `/api/projects/${projectId}/columns`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      setCreateDialogOpen(false);
      setColumnName("");
      toast({
        title: "Columna creada",
        description: "La columna se ha creado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la columna.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return await apiRequest("PATCH", `/api/projects/${projectId}/columns/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      setEditDialogOpen(false);
      setSelectedColumn(null);
      setColumnName("");
      toast({
        title: "Columna actualizada",
        description: "La columna se ha actualizado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la columna.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/projects/${projectId}/columns/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      setDeleteDialogOpen(false);
      setSelectedColumn(null);
      toast({
        title: "Columna eliminada",
        description: "La columna se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la columna. Verifica que no tenga tareas asociadas.",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (newColumns: { id: string; order: number }[]) => {
      return await apiRequest("PATCH", `/api/projects/${projectId}/columns/reorder`, { columns: newColumns });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      toast({
        title: "Columnas reordenadas",
        description: "El orden de las columnas se ha actualizado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo reordenar las columnas.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    createMutation.mutate(columnName);
  };

  const handleEdit = () => {
    if (!selectedColumn) return;
    updateMutation.mutate({ id: selectedColumn.id, name: columnName });
  };

  const handleDelete = () => {
    if (!selectedColumn) return;
    deleteMutation.mutate(selectedColumn.id);
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === columns.length - 1) return;

    const newColumns = [...columns];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];

    const updatedColumns = newColumns.map((col, idx) => ({ id: col.id, order: idx }));
    reorderMutation.mutate(updatedColumns);
  };

  const openEditDialog = (column: ProjectColumn) => {
    setSelectedColumn(column);
    setColumnName(column.name);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (column: ProjectColumn) => {
    setSelectedColumn(column);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Configurar Columnas</h1>
          <p className="text-muted-foreground mt-2">
            Personaliza las columnas de tu proyecto Kanban.
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-column">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Columna
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nueva Columna</DialogTitle>
              <DialogDescription>
                Agrega una nueva columna a tu tablero Kanban.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value)}
                  placeholder="Nombre de la columna"
                  data-testid="input-column-name"
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
                disabled={!columnName || createMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createMutation.isPending ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {columns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <h2 className="text-xl font-semibold mb-2">No hay columnas</h2>
          <p className="text-muted-foreground mb-4">
            Crea tu primera columna para comenzar a organizar tareas.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-column">
            <Plus className="w-4 h-4 mr-2" />
            Crear Columna
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Columnas del Proyecto</CardTitle>
            <CardDescription>
              Administra y reordena las columnas de tu tablero.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {columns.map((column, index) => (
              <div
                key={column.id}
                className="flex items-center gap-2 p-3 border rounded-md hover-elevate"
                data-testid={`column-${column.id}`}
              >
                <GripVertical className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1 font-medium">{column.name}</div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveColumn(index, "up")}
                    disabled={index === 0 || reorderMutation.isPending}
                    data-testid={`button-move-up-${column.id}`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveColumn(index, "down")}
                    disabled={index === columns.length - 1 || reorderMutation.isPending}
                    data-testid={`button-move-down-${column.id}`}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(column)}
                    data-testid={`button-edit-${column.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openDeleteDialog(column)}
                    data-testid={`button-delete-${column.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Columna</DialogTitle>
            <DialogDescription>
              Actualiza el nombre de la columna.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                placeholder="Nombre de la columna"
                data-testid="input-edit-column-name"
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
              disabled={!columnName || updateMutation.isPending}
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
              Esta acción no se puede deshacer. Se eliminará la columna
              <strong> {selectedColumn?.name}</strong>. 
              {" "}No podrás eliminarla si tiene tareas asociadas.
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
