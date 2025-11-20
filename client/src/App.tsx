import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SelectedProjectProvider, useSelectedProject } from "@/contexts/SelectedProjectContext";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/main-layout";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Organizations from "@/pages/organizations";
import Projects from "@/pages/projects";
import Boards from "@/pages/boards";
import BoardView from "@/pages/board-view";
import ProjectColumns from "@/pages/project-columns";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function LegacyBoardsRedirect({ projectId }: { projectId: string }) {
  const { setSelectedProject, isLoading } = useSelectedProject();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      setSelectedProject(projectId);
      setLocation("/boards");
    }
  }, [projectId, setSelectedProject, setLocation, isLoading]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  }

  return null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <SelectedProjectProvider>
      <MainLayout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/organizations" component={Organizations} />
          <Route path="/projects" component={Projects} />
          <Route path="/projects/:id/boards">
            {(params) => <LegacyBoardsRedirect projectId={params.id} />}
          </Route>
          <Route path="/boards" component={Boards} />
          <Route path="/boards/:id" component={BoardView} />
          <Route path="/projects/:id/columns" component={ProjectColumns} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </MainLayout>
    </SelectedProjectProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
