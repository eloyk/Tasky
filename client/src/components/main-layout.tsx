import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProjectSelector } from "@/components/project-selector";
import { useLocation } from "wouter";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  // Usar pathname del navegador para manejar correctamente query strings
  const pathname = typeof window !== 'undefined' ? window.location.pathname : location;

  const getPageTitle = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname === "/boards" || pathname.startsWith("/boards/")) return "Tableros";
    if (pathname.startsWith("/organizations")) return "Organizaciones";
    if (pathname.startsWith("/settings")) return "Configuración";
    if (pathname.startsWith("/admin")) return "Centro de Control";
    return "Dashboard";
  };

  const pageTitle = getPageTitle();
  const isBoardView = pathname.startsWith("/boards/");
  
  // Ocultar ProjectSelector en páginas específicas
  const shouldHideProjectSelector = 
    pathname === "/" ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/organizations");
  
  const showProjectSelector = !isBoardView && !shouldHideProjectSelector;

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between border-b px-6 py-3 gap-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h2 className="text-lg font-semibold">{pageTitle}</h2>
            </div>
            <div className="flex items-center gap-4">
              {showProjectSelector && <ProjectSelector />}
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
