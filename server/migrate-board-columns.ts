import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema });

async function migrateToBoardColumns() {
  console.log("🔄 Starting migration: Project Columns → Board Columns");
  
  try {
    // Step 1: Create the new board_columns table with the correct schema
    console.log("\n📋 Step 1: Creating board_columns table...");
    await sql`
      CREATE TABLE IF NOT EXISTS board_columns (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id VARCHAR NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        "order" INTEGER NOT NULL,
        color VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_board_order 
      ON board_columns(board_id, "order");
    `;
    
    console.log("✅ board_columns table created");

    // Step 2: Get all existing project columns
    console.log("\n📋 Step 2: Fetching existing project columns...");
    const projectColumns = await sql`
      SELECT id, project_id, name, "order", color, created_at
      FROM project_columns
      ORDER BY project_id, "order";
    `;
    
    console.log(`Found ${projectColumns.length} project columns`);

    // Step 3: Get all boards for each project
    console.log("\n📋 Step 3: Duplicating columns for each board...");
    
    let totalCreated = 0;
    
    for (const column of projectColumns) {
      // Get all boards for this column's project
      const boards = await sql`
        SELECT id, name FROM boards 
        WHERE project_id = ${column.project_id}
      `;
      
      console.log(`\n  Column "${column.name}" (project ${column.project_id})`);
      console.log(`  → Creating for ${boards.length} board(s)...`);
      
      // Create a copy of this column for each board
      for (const board of boards) {
        await sql`
          INSERT INTO board_columns (board_id, name, "order", color, created_at)
          VALUES (
            ${board.id},
            ${column.name},
            ${column.order},
            ${column.color},
            ${column.created_at}
          );
        `;
        
        console.log(`    ✓ Created for board "${board.name}"`);
        totalCreated++;
      }
    }

    console.log(`\n✅ Created ${totalCreated} board columns from ${projectColumns.length} project columns`);

    // Step 4: Update tasks to reference the correct board column
    console.log("\n📋 Step 4: Updating tasks to reference board columns...");
    
    const tasks = await sql`
      SELECT t.id, t.board_id, t.column_id, pc.name, pc."order"
      FROM tasks t
      JOIN project_columns pc ON pc.id = t.column_id
    `;
    
    console.log(`Found ${tasks.length} tasks to update`);
    
    let tasksUpdated = 0;
    
    for (const task of tasks) {
      // Find the matching board column (same board, same column name and order)
      const [boardColumn] = await sql`
        SELECT id FROM board_columns
        WHERE board_id = ${task.board_id}
        AND name = ${task.name}
        AND "order" = ${task.order}
        LIMIT 1
      `;
      
      if (boardColumn) {
        await sql`
          UPDATE tasks 
          SET column_id = ${boardColumn.id}
          WHERE id = ${task.id}
        `;
        tasksUpdated++;
      } else {
        console.warn(`⚠️  No matching board column found for task ${task.id}`);
      }
    }
    
    console.log(`✅ Updated ${tasksUpdated} tasks`);

    // Step 5: Drop the old project_columns table
    console.log("\n📋 Step 5: Dropping old project_columns table...");
    await sql`DROP TABLE IF EXISTS project_columns CASCADE;`;
    console.log("✅ project_columns table dropped");

    console.log("\n✨ Migration completed successfully!");
    
    // Summary
    console.log("\n📊 Summary:");
    console.log(`  • Project columns migrated: ${projectColumns.length}`);
    console.log(`  • Board columns created: ${totalCreated}`);
    console.log(`  • Tasks updated: ${tasksUpdated}`);
    
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  }
}

// Run migration
migrateToBoardColumns()
  .then(() => {
    console.log("\n🎉 Migration script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration script failed:", error);
    process.exit(1);
  });
