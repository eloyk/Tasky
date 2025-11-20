import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, AlertCircle, Calendar, ListTodo, Flag } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface AnalyticsData {
  totalTasks: number;
  tasksByStatus: { columnName: string; count: number }[];
  tasksByPriority: { priority: string; count: number }[];
  overdueTasks: number;
  completedLast7Days: number;
  upcomingDueTasks: number;
  recentActivity: {
    id: string;
    taskId: string;
    userId: string;
    actionType: string;
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
    createdAt: Date;
    user: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    } | null;
  }[];
}

export default function Home() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/overview"],
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const hasData = analytics && analytics.totalTasks > 0;

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      high: "Alta",
      medium: "Media",
      low: "Baja",
    };
    return labels[priority] || priority;
  };

  const getPriorityVariant = (priority: string): "default" | "secondary" | "destructive" => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      high: "destructive",
      medium: "default",
      low: "secondary",
    };
    return variants[priority] || "default";
  };

  const getActivityDescription = (activity: AnalyticsData["recentActivity"][0]) => {
    const userName = activity.user?.firstName && activity.user?.lastName
      ? `${activity.user.firstName} ${activity.user.lastName}`
      : activity.user?.email || "Usuario";

    switch (activity.actionType) {
      case "created":
        return `${userName} creó la tarea`;
      case "column_change":
        return `${userName} movió la tarea`;
      case "updated":
        return `${userName} actualizó ${activity.fieldName || "la tarea"}`;
      case "deleted":
        return `${userName} eliminó la tarea`;
      default:
        return `${userName} realizó una acción`;
    }
  };

  return (
    <div className="p-8 space-y-8" data-testid="dashboard-container">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="dashboard-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2" data-testid="dashboard-subtitle">
          Resumen general de tu organización
        </p>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center space-y-4 max-w-md">
            <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto" />
            <h2 className="text-2xl font-semibold" data-testid="empty-state-title">
              Sin datos para mostrar
            </h2>
            <p className="text-muted-foreground" data-testid="empty-state-description">
              Aún no tienes tareas creadas. Comienza creando tu primera tarea para ver las métricas del dashboard.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Grid de métricas principales */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Tareas */}
            <Card data-testid="card-total-tasks">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Tareas</CardTitle>
                <ListTodo className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="metric-total-tasks">
                  {analytics?.totalTasks || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Todas las tareas activas
                </p>
              </CardContent>
            </Card>

            {/* Tareas Vencidas */}
            <Card data-testid="card-overdue-tasks">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tareas Vencidas</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive" data-testid="metric-overdue-tasks">
                  {analytics?.overdueTasks || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Requieren atención inmediata
                </p>
              </CardContent>
            </Card>

            {/* Completadas últimos 7 días */}
            <Card data-testid="card-completed-tasks">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completadas (7 días)</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="metric-completed-tasks">
                  {analytics?.completedLast7Days || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Tareas finalizadas recientemente
                </p>
              </CardContent>
            </Card>

            {/* Próximas a vencer */}
            <Card data-testid="card-upcoming-tasks">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Próximas a vencer</CardTitle>
                <Calendar className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600" data-testid="metric-upcoming-tasks">
                  {analytics?.upcomingDueTasks || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Vencen en los próximos 3 días
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tareas por estado y prioridad */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Tareas por Estado */}
            <Card data-testid="card-tasks-by-status">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Tareas por Estado
                </CardTitle>
                <CardDescription>
                  Distribución de tareas según columnas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics?.tasksByStatus && analytics.tasksByStatus.length > 0 ? (
                  <div className="space-y-4">
                    {analytics.tasksByStatus.map((status, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between"
                        data-testid={`status-item-${index}`}
                      >
                        <span className="text-sm font-medium" data-testid={`status-name-${index}`}>
                          {status.columnName}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${(status.count / (analytics?.totalTasks || 1)) * 100}%`,
                              }}
                            />
                          </div>
                          <span
                            className="text-sm font-bold min-w-[2rem] text-right"
                            data-testid={`status-count-${index}`}
                          >
                            {status.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4" data-testid="no-status-data">
                    No hay datos de estado disponibles
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Tareas por Prioridad */}
            <Card data-testid="card-tasks-by-priority">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-5 w-5" />
                  Tareas por Prioridad
                </CardTitle>
                <CardDescription>
                  Distribución según nivel de prioridad
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics?.tasksByPriority && analytics.tasksByPriority.length > 0 ? (
                  <div className="space-y-4">
                    {analytics.tasksByPriority.map((priority, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between"
                        data-testid={`priority-item-${index}`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={getPriorityVariant(priority.priority)}
                            className="min-w-[4rem] justify-center"
                            data-testid={`priority-badge-${index}`}
                          >
                            {getPriorityLabel(priority.priority)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${(priority.count / (analytics?.totalTasks || 1)) * 100}%`,
                              }}
                            />
                          </div>
                          <span
                            className="text-sm font-bold min-w-[2rem] text-right"
                            data-testid={`priority-count-${index}`}
                          >
                            {priority.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4" data-testid="no-priority-data">
                    No hay datos de prioridad disponibles
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Actividad Reciente */}
          <Card data-testid="card-recent-activity">
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>
                Últimas actualizaciones en tus tareas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analytics?.recentActivity && analytics.recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {analytics.recentActivity.map((activity, index) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0"
                      data-testid={`activity-item-${index}`}
                    >
                      <div className="flex-1 space-y-1">
                        <p className="text-sm" data-testid={`activity-description-${index}`}>
                          {getActivityDescription(activity)}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`activity-time-${index}`}>
                          {formatDistanceToNow(new Date(activity.createdAt), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs" data-testid={`activity-type-${index}`}>
                        {activity.actionType}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="no-activity-data">
                  No hay actividad reciente
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
