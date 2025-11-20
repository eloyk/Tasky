import { db } from "./db";
import { tasks, boards } from "@shared/schema";
import { sql } from "drizzle-orm";

async function migrateBoardIds() {
  console.log("Iniciando migración de boardId para tareas existentes...");
  
  try {
    // Primero, obtener todas las tareas sin boardId
    const tasksWithoutBoard = await db.execute(sql`
      SELECT id, project_id FROM tasks WHERE board_id IS NULL
    `);
    
    console.log(`Encontradas ${tasksWithoutBoard.rows.length} tareas sin boardId`);
    
    for (const task of tasksWithoutBoard.rows) {
      // Para cada tarea, obtener el primer board de su proyecto
      const boardResult = await db.execute(sql`
        SELECT id FROM boards WHERE project_id = ${task.project_id} LIMIT 1
      `);
      
      if (boardResult.rows.length > 0) {
        const boardId = boardResult.rows[0].id;
        console.log(`Asignando tarea ${task.id} al board ${boardId}`);
        
        await db.execute(sql`
          UPDATE tasks SET board_id = ${boardId} WHERE id = ${task.id}
        `);
      } else {
        console.error(`No se encontró un board para el proyecto ${task.project_id}`);
      }
    }
    
    console.log("Migración completada exitosamente");
  } catch (error) {
    console.error("Error durante la migración:", error);
    throw error;
  }
}

migrateBoardIds()
  .then(() => {
    console.log("✅ Migración finalizada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error);
    process.exit(1);
  });
