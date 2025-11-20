import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";

interface SelectedProjectContextValue {
  selectedProjectId: string | null;
  selectedProject: Project | null;
  setSelectedProject: (projectId: string | null) => void;
  clearSelection: () => void;
  isLoading: boolean;
}

const SelectedProjectContext = createContext<SelectedProjectContextValue | undefined>(undefined);

const STORAGE_KEY = "tasky-selected-project-id";

export function SelectedProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;

  useEffect(() => {
    if (selectedProjectId !== null && projects.length > 0 && !selectedProject) {
      clearSelection();
    }
  }, [selectedProjectId, projects, selectedProject]);

  useEffect(() => {
    if (selectedProjectId === null && projects.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setSelectedProject(projects[0].id);
      }
    }
  }, [projects, selectedProjectId]);

  const setSelectedProject = (projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    if (projectId === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, projectId);
    }
  };

  const clearSelection = () => {
    setSelectedProjectIdState(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <SelectedProjectContext.Provider
      value={{
        selectedProjectId,
        selectedProject,
        setSelectedProject,
        clearSelection,
        isLoading: projectsLoading,
      }}
    >
      {children}
    </SelectedProjectContext.Provider>
  );
}

export function useSelectedProject() {
  const context = useContext(SelectedProjectContext);
  if (!context) {
    throw new Error("useSelectedProject must be used within SelectedProjectProvider");
  }
  return context;
}
