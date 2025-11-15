import { CheckCircle2, Users, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Tasky RD</h1>
          </div>
          <Button asChild data-testid="button-login">
            <a href="/api/login">Iniciar Sesión</a>
          </Button>
        </div>
      </header>

      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold text-foreground mb-6 leading-tight">
              Gestiona Tareas Colaborativamente
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Tasky RD es una aplicación web intuitiva que permite a equipos crear, asignar y completar tareas mediante un tablero Kanban visual. Aumenta la productividad de tu equipo con una gestión simple y efectiva.
            </p>
            <Button size="lg" asChild data-testid="button-get-started">
              <a href="/api/login">Comenzar Ahora</a>
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            <Card className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-md flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Colaboración</h3>
              <p className="text-sm text-muted-foreground">
                Gestiona tareas colaborativamente mediante un tablero Kanban que permite crear, asignar y completar tareas en equipo.
              </p>
            </Card>

            <Card className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-md flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Usabilidad</h3>
              <p className="text-sm text-muted-foreground">
                Interfaz intuitiva y responsiva accesible desde dispositivos móviles y de escritorio para trabajar desde cualquier lugar.
              </p>
            </Card>

            <Card className="p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-md flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Organización</h3>
              <p className="text-sm text-muted-foreground">
                Visualiza el estado de cada tarea, añade comentarios, adjunta archivos y marca el progreso de manera clara y organizada.
              </p>
            </Card>
          </div>

          <div className="bg-card border border-card-border rounded-md p-8">
            <h3 className="text-2xl font-semibold mb-6 text-center">Características Principales</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-sm mb-1">Tablero Kanban Interactivo</h4>
                  <p className="text-xs text-muted-foreground">Arrastra y suelta tareas entre columnas Pendiente, En Progreso y Completada</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-sm mb-1">Gestión Completa de Tareas</h4>
                  <p className="text-xs text-muted-foreground">Crea, edita, asigna y elimina tareas con título, descripción, prioridad y fechas de vencimiento</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-sm mb-1">Comentarios y Adjuntos</h4>
                  <p className="text-xs text-muted-foreground">Añade comentarios a las tareas y adjunta archivos para mejor comunicación</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-sm mb-1">Diseño Responsivo</h4>
                  <p className="text-xs text-muted-foreground">Interfaz adaptable para uso en dispositivos móviles, tablets y computadoras</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Tasky RD. Gestión de tareas colaborativa para equipos modernos.</p>
        </div>
      </footer>
    </div>
  );
}
