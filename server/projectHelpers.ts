import { db } from "./db.js";
import { boardColumns, type InsertBoardColumn } from "../shared/schema.js";

/**
 * Crea las columnas por defecto para un nuevo board
 * Columnas: Pendiente, En Progreso, Completada
 */
export async function createDefaultBoardColumns(boardId: string): Promise<void> {
  const defaultColumns: Omit<InsertBoardColumn, "id" | "createdAt">[] = [
    {
      boardId,
      name: "Pendiente",
      order: 0,
      color: "#94a3b8", // Gris azulado
    },
    {
      boardId,
      name: "En Progreso",
      order: 1,
      color: "#60a5fa", // Azul
    },
    {
      boardId,
      name: "Completada",
      order: 2,
      color: "#34d399", // Verde
    },
  ];

  // Insertar todas las columnas
  await db.insert(boardColumns).values(defaultColumns);
  
  console.log(`[projectHelpers] Created ${defaultColumns.length} default columns for board: ${boardId}`);
}
