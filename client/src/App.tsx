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
import Settings from "@/pages/settings";
import Teams from "@/pages/teams";
import Admin from "@/pages/admin";
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
  const [location, setLocation] = useLocation();

  // Garantizar navegación correcta según estado de autenticación:
  // - Si NO está autenticado y trata de acceder a ruta protegida → Redirigir a landing (/)
  // - Si SÍ está autenticado → Quedarse en la página actual (dashboard, boards, etc.)
  useEffect(() => {
    if (isLoading) return;
    
    if (!isAuthenticated && location !== "/") {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  // Mientras carga, no renderizar nada para evitar flash de contenido
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  }

  // Usuario NO autenticado → Solo mostrar landing page
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Usuario autenticado → Mostrar rutas protegidas (dashboard, boards, etc.)
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
          <Route path="/settings" component={Settings} />
          <Route path="/teams" component={Teams} />
          <Route path="/admin" component={Admin} />
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
