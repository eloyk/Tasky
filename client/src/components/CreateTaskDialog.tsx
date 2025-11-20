import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { insertTaskSchema, type Project, type ProjectColumn } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Plus } from "lucide-react";

const formSchema = insertTaskSchema.extend({
  dueDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateTaskDialogProps {
  onSubmit: (data: FormValues) => void;
  isPending: boolean;
  userId?: string;
  testIdPrefix?: string;
}

export function CreateTaskDialog({ onSubmit, isPending, userId = "", testIdPrefix = "" }: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false);

  // Obtener proyectos del usuario
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      columnId: "",
      priority: "medium",
      dueDate: "",
      projectId: "",
      createdById: userId,
    },
  });

  // Observar el projectId seleccionado para cargar las columnas dinámicamente
  const selectedProjectId = form.watch("projectId");

  // Obtener columnas del proyecto seleccionado
  const { data: projectColumns = [], isLoading: isLoadingColumns } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/projects", selectedProjectId, "columns"],
    enabled: !!selectedProjectId,
  });

  // Establecer el primer proyecto cuando se carguen los proyectos por primera vez
  // Y validar que el proyecto seleccionado existe en la lista
  useEffect(() => {
    if (projects.length > 0) {
      if (!selectedProjectId) {
        // No hay proyecto seleccionado, establecer el primero
        form.setValue("projectId", projects[0].id);
      } else {
        // Hay proyecto seleccionado, validar que existe en la lista
        const projectExists = projects.some(p => p.id === selectedProjectId);
        if (!projectExists) {
          // El proyecto seleccionado ya no existe, limpiar y establecer el primero
          form.setValue("projectId", projects[0].id);
          form.setValue("columnId", "");
        }
      }
    } else if (selectedProjectId) {
      // No hay proyectos pero hay projectId seleccionado, limpiar
      form.setValue("projectId", "");
      form.setValue("columnId", "");
    }
  }, [projects, selectedProjectId, form]);

  // Actualizar columnId cuando cambien las columnas del proyecto
  useEffect(() => {
    const currentColumnId = form.getValues("columnId");
    
    if (isLoadingColumns) {
      // Mientras se cargan las columnas, limpiar el columnId para prevenir estado obsoleto
      form.setValue("columnId", "");
      return;
    }

    if (projectColumns.length > 0) {
      // Si hay columnas y el actual no existe en las columnas del proyecto
      const columnExists = projectColumns.some(col => col.id === currentColumnId);
      if (!currentColumnId || !columnExists) {
        form.setValue("columnId", projectColumns[0].id);
      }
    } else {
      // Si no hay columnas disponibles, asegurar que columnId esté vacío
      if (currentColumnId) {
        form.setValue("columnId", "");
      }
    }
  }, [projectColumns, isLoadingColumns, form]);

  const handleSubmit = (data: FormValues) => {
    // Validar que la columna seleccionada pertenezca al proyecto seleccionado
    const columnBelongsToProject = projectColumns.some(col => col.id === data.columnId);
    if (!columnBelongsToProject) {
      // Este error no debería ocurrir si el UI está configurado correctamente
      console.error("La columna seleccionada no pertenece al proyecto seleccionado");
      return;
    }

    // Asegurar que createdById esté establecido
    const taskData = {
      ...data,
      createdById: userId || data.createdById,
    };
    onSubmit(taskData);
    form.reset({
      title: "",
      description: "",
      columnId: "",
      priority: "medium",
      dueDate: "",
      projectId: selectedProjectId,
      createdById: userId,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid={testIdPrefix ? `${testIdPrefix}-button-create-task` : "button-create-task"}>
          <Plus className="w-5 h-5 mr-2" />
          Nueva Tarea
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear Nueva Tarea</DialogTitle>
          <DialogDescription>
            Completa los detalles de la tarea y asígnale prioridad.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proyecto</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingProjects || projects.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-project">
                          <SelectValue placeholder="Selecciona un proyecto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="columnId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Columna</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingColumns || projectColumns.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-column">
                          <SelectValue placeholder="Selecciona una columna" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectColumns.map((column) => (
                          <SelectItem key={column.id} value={column.id}>
                            {column.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nombre de la tarea"
                      {...field}
                      data-testid="input-task-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder="Detalles de la tarea..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridad</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-task-priority">
                          <SelectValue placeholder="Seleccionar prioridad" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Vencimiento</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-task-due-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-task"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isPending || isLoadingProjects || isLoadingColumns || !selectedProjectId || !form.watch("columnId")} 
                data-testid="button-submit-task"
              >
                {isPending ? "Creando..." : (isLoadingProjects || isLoadingColumns) ? "Cargando..." : "Crear Tarea"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
