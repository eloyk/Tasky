import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation } from "wouter";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();

  const getPageTitle = () => {
    if (location === "/") return "Dashboard";
    if (location === "/projects") return "Proyectos";
    if (location.startsWith("/projects/") && location.includes("/boards")) return "Tableros";
    if (location.startsWith("/boards/")) return "Tablero";
    if (location === "/organizations") return "Organizaciones";
    if (location === "/settings") return "Configuración";
    return "Dashboard";
  };

  const pageTitle = getPageTitle();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between border-b px-6 py-3">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h2 className="text-lg font-semibold">{pageTitle}</h2>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
