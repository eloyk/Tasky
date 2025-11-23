import { useQuery } from "@tanstack/react-query";
import { Shield, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function Admin() {
  const { data: currentUser, isLoading } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-12 w-64 mb-8" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Verificar que el usuario es admin o owner
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No tienes permisos para acceder a esta página. Solo los administradores pueden ver el Centro de Control.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Centro de Control</h1>
        </div>
        <p className="text-muted-foreground">
          Gestiona tu organización, equipos, proyectos y permisos desde un solo lugar.
        </p>
      </div>

      <Tabs defaultValue="teams" className="space-y-4">
        <TabsList>
          <TabsTrigger value="organization" data-testid="tab-organization">
            Organización
          </TabsTrigger>
          <TabsTrigger value="teams" data-testid="tab-teams">
            Equipos
          </TabsTrigger>
          <TabsTrigger value="projects" data-testid="tab-projects">
            Proyectos
          </TabsTrigger>
          <TabsTrigger value="boards" data-testid="tab-boards">
            Tableros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Información de la Organización</CardTitle>
              <CardDescription>
                Configuración general de tu organización
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Próximamente...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gestión de Equipos</CardTitle>
              <CardDescription>
                Administra los equipos de tu organización y sus miembros
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">En construcción...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Proyectos y Permisos</CardTitle>
              <CardDescription>
                Gestiona todos los proyectos y sus permisos de equipos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">En construcción...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boards" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tableros y Permisos</CardTitle>
              <CardDescription>
                Gestiona todos los tableros y sus permisos de equipos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">En construcción...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
