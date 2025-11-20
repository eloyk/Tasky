import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Settings, Plus, Trash2, GripVertical, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Board, ProjectColumn } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface SortableColumnItemProps {
  column: ProjectColumn;
  onEdit: (column: ProjectColumn) => void;
  onDelete: (columnId: string) => void;
}

function SortableColumnItem({ column, onEdit, onDelete }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 border rounded-md bg-background"
      data-testid={`column-item-${column.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="flex-1">{column.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEdit(column)}
        data-testid={`button-edit-column-${column.id}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(column.id)}
        data-testid={`button-delete-column-${column.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface ConfigureColumnsDialogProps {
  board: Board;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigureColumnsDialog({ board, open, onOpenChange }: ConfigureColumnsDialogProps) {
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumn, setEditingColumn] = useState<ProjectColumn | null>(null);
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [localColumns, setLocalColumns] = useState<ProjectColumn[]>([]);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: columns = [], isLoading } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/boards", board.id, "columns"],
    enabled: open,
  });

  useEffect(() => {
    setLocalColumns([...columns]);
  }, [columns]);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest("POST", `/api/projects/${board.projectId}/columns`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", board.id, "columns"] });
      setNewColumnName("");
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
    mutationFn: async ({ columnId, name }: { columnId: string; name: string }) => {
      return await apiRequest("PATCH", `/api/projects/${board.projectId}/columns/${columnId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", board.id, "columns"] });
      setEditingColumn(null);
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
    mutationFn: async (columnId: string) => {
      return await apiRequest("DELETE", `/api/projects/${board.projectId}/columns/${columnId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", board.id, "columns"] });
      setDeleteColumnId(null);
      toast({
        title: "Columna eliminada",
        description: "La columna se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la columna.",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderedColumns: { id: string; order: number }[]) => {
      return await apiRequest("PATCH", `/api/projects/${board.projectId}/columns/reorder`, {
        columns: reorderedColumns,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", board.id, "columns"] });
      toast({
        title: "Columnas reordenadas",
        description: "El orden de las columnas se ha actualizado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo reordenar las columnas.",
        variant: "destructive",
      });
      setLocalColumns([...columns]);
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setLocalColumns((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      
      const newOrder = arrayMove(items, oldIndex, newIndex);
      
      const reorderedColumns = newOrder.map((col, index) => ({
        id: col.id,
        order: index,
      }));
      
      reorderMutation.mutate(reorderedColumns);
      
      return newOrder;
    });
  };

  const handleCreate = () => {
    if (!newColumnName.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la columna es requerido.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(newColumnName);
  };

  const handleUpdate = () => {
    if (!editingColumn || !editingColumn.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la columna es requerido.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ columnId: editingColumn.id, name: editingColumn.name });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl" data-testid="dialog-configure-columns">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurar Columnas - {board.name}
            </DialogTitle>
            <DialogDescription>
              Administra las columnas del tablero. Las columnas organizan tus tareas en el Kanban.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Columnas Actuales</Label>
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Cargando...</div>
              ) : localColumns.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No hay columnas. Crea la primera columna.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={localColumns.map((col) => col.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {localColumns.map((column) => (
                        <SortableColumnItem
                          key={column.id}
                          column={column}
                          onEdit={(col) => setEditingColumn({ ...col })}
                          onDelete={setDeleteColumnId}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-column-name">Nueva Columna</Label>
              <div className="flex gap-2">
                <Input
                  id="new-column-name"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Nombre de la columna"
                  data-testid="input-new-column-name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreate();
                    }
                  }}
                />
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newColumnName.trim()}
                  data-testid="button-add-column"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-columns"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Column Dialog */}
      {editingColumn && (
        <Dialog open={!!editingColumn} onOpenChange={(open) => !open && setEditingColumn(null)}>
          <DialogContent data-testid="dialog-edit-column">
            <DialogHeader>
              <DialogTitle>Editar Columna</DialogTitle>
              <DialogDescription>Cambia el nombre de la columna.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-column-name">Nombre</Label>
                <Input
                  id="edit-column-name"
                  value={editingColumn.name}
                  onChange={(e) =>
                    setEditingColumn({ ...editingColumn, name: e.target.value })
                  }
                  data-testid="input-edit-column-name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditingColumn(null)}
                data-testid="button-cancel-edit-column"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending || !editingColumn.name.trim()}
                data-testid="button-save-column"
              >
                {updateMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteColumnId} onOpenChange={(open) => !open && setDeleteColumnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la columna. Las tareas en esta columna también se eliminarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-column">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteColumnId && deleteMutation.mutate(deleteColumnId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-column"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
