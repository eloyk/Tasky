import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LayoutGrid, Plus, Pencil, Trash2, FolderKanban, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSelectedProject } from "@/contexts/SelectedProjectContext";
import { ConfigureColumnsDialog } from "@/components/configure-columns-dialog";
import type { Board, InsertBoard } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function Boards() {
  const { selectedProject, selectedProjectId } = useSelectedProject();
  const [, setLocation] = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configureColumnsBoard, setConfigureColumnsBoard] = useState<Board | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const { toast } = useToast();

  // Get boards for selected project
  const { data: boards = [], isLoading: boardsLoading } = useQuery<Board[]>({
    queryKey: ["/api/projects", selectedProjectId, "boards"],
    enabled: !!selectedProjectId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertBoard) => {
      return await apiRequest("POST", "/api/boards", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "boards"] });
      setCreateDialogOpen(false);
      setFormData({ name: "", description: "" });
      toast({
        title: "Tablero creado",
        description: "El tablero se ha creado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el tablero.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertBoard> }) => {
      return await apiRequest("PATCH", `/api/boards/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "boards"] });
      setEditDialogOpen(false);
      setSelectedBoard(null);
      setFormData({ name: "", description: "" });
      toast({
        title: "Tablero actualizado",
        description: "El tablero se ha actualizado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el tablero.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/boards/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "boards"] });
      setDeleteDialogOpen(false);
      setSelectedBoard(null);
      toast({
        title: "Tablero eliminado",
        description: "El tablero se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el tablero.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!selectedProjectId) {
      toast({
        title: "Error",
        description: "Selecciona un proyecto primero.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre del tablero es requerido.",
        variant: "destructive",
      });
      return;
    }
    
    createMutation.mutate({
      name: formData.name,
      description: formData.description || null,
      projectId: selectedProjectId,
    });
  };

  const handleEdit = () => {
    if (!selectedBoard) return;
    updateMutation.mutate({
      id: selectedBoard.id,
      data: {
        name: formData.name,
        description: formData.description || null,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedBoard) return;
    deleteMutation.mutate(selectedBoard.id);
  };

  const openEditDialog = (board: Board) => {
    setSelectedBoard(board);
    setFormData({ name: board.name, description: board.description || "" });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (board: Board) => {
    setSelectedBoard(board);
    setDeleteDialogOpen(true);
  };

  if (!selectedProjectId) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed rounded-lg">
          <FolderKanban className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Selecciona un Proyecto</h2>
          <p className="text-muted-foreground mb-4 text-center max-w-md">
            Selecciona un proyecto desde el dropdown en el header para ver sus tableros.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Tableros</h1>
          <p className="text-muted-foreground mt-2">
            Gestiona los tableros de <strong>{selectedProject?.name}</strong>
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-board">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Tablero
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Tablero</DialogTitle>
              <DialogDescription>
                Completa los detalles del tablero.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre del tablero"
                  data-testid="input-board-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del tablero (opcional)"
                  data-testid="input-board-description"
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

      {boardsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : boards.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
          <LayoutGrid className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No hay tableros</h2>
          <p className="text-muted-foreground mb-4">Crea tu primer tablero para comenzar.</p>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-board">
            <Plus className="w-4 h-4 mr-2" />
            Crear Tablero
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boards.map((board) => (
            <Card key={board.id} data-testid={`card-board-${board.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5" />
                  {board.name}
                </CardTitle>
                {board.description && (
                  <CardDescription>{board.description}</CardDescription>
                )}
              </CardHeader>
              <CardFooter className="flex flex-col gap-2">
                <div className="flex justify-between w-full gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setLocation(`/boards/${board.id}`)}
                    data-testid={`button-open-${board.id}`}
                  >
                    <LayoutGrid className="w-4 h-4 mr-1" />
                    Abrir Tablero
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(board)}
                      data-testid={`button-edit-${board.id}`}
                    >
                      <Pencil className="w-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(board)}
                      data-testid={`button-delete-${board.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setConfigureColumnsBoard(board)}
                  data-testid={`button-configure-columns-${board.id}`}
                >
                  <Settings className="w-4 h-4 mr-1" />
                  Configurar Columnas
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
            <DialogTitle>Editar Tablero</DialogTitle>
            <DialogDescription>
              Actualiza los detalles del tablero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre del tablero"
                data-testid="input-edit-board-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción del tablero (opcional)"
                data-testid="input-edit-board-description"
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
              Esta acción no se puede deshacer. Se eliminará permanentemente el tablero
              <strong> {selectedBoard?.name}</strong> y todas sus columnas y tareas asociadas.
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

      {/* Configure Columns Dialog */}
      {configureColumnsBoard && (
        <ConfigureColumnsDialog
          board={configureColumnsBoard}
          open={!!configureColumnsBoard}
          onOpenChange={(open) => !open && setConfigureColumnsBoard(null)}
        />
      )}
    </div>
  );
}
