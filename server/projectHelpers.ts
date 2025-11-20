import { db } from "./db.js";
import { projectColumns, type InsertProjectColumn } from "../shared/schema.js";

/**
 * Crea las columnas por defecto para un nuevo proyecto
 * Columnas: Pendiente, En Progreso, Completada
 */
export async function createDefaultProjectColumns(projectId: string): Promise<void> {
  const defaultColumns: Omit<InsertProjectColumn, "id" | "createdAt">[] = [
    {
      projectId,
      name: "Pendiente",
      order: 0,
      color: "#94a3b8", // Gris azulado
    },
    {
      projectId,
      name: "En Progreso",
      order: 1,
      color: "#60a5fa", // Azul
    },
    {
      projectId,
      name: "Completada",
      order: 2,
      color: "#34d399", // Verde
    },
  ];

  // Insertar todas las columnas
  await db.insert(projectColumns).values(defaultColumns);
  
  console.log(`[projectHelpers] Created ${defaultColumns.length} default columns for project: ${projectId}`);
}
