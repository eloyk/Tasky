import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FolderKanban, Plus, Settings } from "lucide-react";
import { useSelectedProject } from "@/contexts/SelectedProjectContext";
import type { Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateProjectDialog, EditProjectDialog } from "./project-dialogs";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectSelector() {
  const { selectedProject, setSelectedProject, isLoading } = useSelectedProject();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  if (isLoading) {
    return <Skeleton className="h-9 w-48" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 min-w-[200px] justify-between"
            data-testid="button-project-selector"
          >
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              <span className="truncate">
                {selectedProject?.name || "Seleccionar Proyecto"}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[250px]">
          <DropdownMenuLabel>Proyectos</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No hay proyectos. Crea uno nuevo.
            </div>
          ) : (
            projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => setSelectedProject(project.id)}
                data-testid={`menu-item-project-${project.id}`}
                className={selectedProject?.id === project.id ? "bg-accent" : ""}
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setEditDialogOpen(true)}
            disabled={!selectedProject}
            data-testid="menu-item-configure-project"
          >
            <Settings className="mr-2 h-4 w-4" />
            Configurar Proyecto
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setCreateDialogOpen(true)}
            data-testid="menu-item-new-project"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Proyecto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <EditProjectDialog
        project={selectedProject}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </>
  );
}
