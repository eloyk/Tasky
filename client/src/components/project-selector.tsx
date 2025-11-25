import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FolderKanban, Plus, Settings, Building2 } from "lucide-react";
import { useSelectedProject } from "@/contexts/SelectedProjectContext";
import type { Project, Organization } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
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

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/my-organizations'],
  });

  // Group projects by organization
  const projectsByOrg = useMemo(() => {
    const grouped = new Map<string, { org: Organization | undefined; projects: Project[] }>();
    
    for (const project of projects) {
      const orgId = project.organizationId;
      const org = organizations.find(o => o.id === orgId);
      
      if (!grouped.has(orgId)) {
        grouped.set(orgId, { org, projects: [] });
      }
      grouped.get(orgId)!.projects.push(project);
    }
    
    return Array.from(grouped.entries());
  }, [projects, organizations]);

  // Get organization name for selected project
  const selectedOrgName = useMemo(() => {
    if (!selectedProject) return null;
    return organizations.find(o => o.id === selectedProject.organizationId)?.name;
  }, [selectedProject, organizations]);

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
            <div className="flex items-center gap-2 min-w-0">
              <FolderKanban className="h-4 w-4 shrink-0" />
              <div className="truncate">
                <span>{selectedProject?.name || "Seleccionar Proyecto"}</span>
                {selectedOrgName && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({selectedOrgName})
                  </span>
                )}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[300px] max-h-[400px] overflow-y-auto">
          <DropdownMenuLabel>Proyectos</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No hay proyectos. Crea uno nuevo.
            </div>
          ) : (
            projectsByOrg.map(([orgId, { org, projects: orgProjects }]) => (
              <DropdownMenuGroup key={orgId}>
                <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground font-normal py-1">
                  <Building2 className="h-3 w-3" />
                  {org?.name || "Organización"}
                </DropdownMenuLabel>
                {orgProjects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => setSelectedProject(project.id)}
                    data-testid={`menu-item-project-${project.id}`}
                    className={selectedProject?.id === project.id ? "bg-accent" : ""}
                  >
                    <FolderKanban className="mr-2 h-4 w-4" />
                    <span className="truncate">{project.name}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </DropdownMenuGroup>
            ))
          )}
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
