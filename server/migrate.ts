import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pkg from 'pg';
const { Pool } = pkg;

interface MigrationStep {
  name: string;
  check: () => Promise<boolean>;
  execute: () => Promise<void>;
}

class DatabaseMigrator {
  private pool: pkg.Pool;
  private db: ReturnType<typeof drizzle>;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.db = drizzle(this.pool);
  }

  async checkTableExists(tableName: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    return result.rows[0].exists;
  }

  async checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1 
        AND column_name = $2
      );
    `, [tableName, columnName]);
    return result.rows[0].exists;
  }

  async checkIndexExists(indexName: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = $1
      );
    `, [indexName]);
    return result.rows[0].exists;
  }

  async checkConstraintExists(tableName: string, constraintName: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
        AND table_name = $1 
        AND constraint_name = $2
      );
    `, [tableName, constraintName]);
    return result.rows[0].exists;
  }

  private createBoardsTableStep(): MigrationStep {
    return {
      name: 'Crear tabla boards',
      check: async () => {
        const boardsExists = await this.checkTableExists('boards');
        if (boardsExists) return true; // Ya existe
        
        // Verificar que las tablas prerequisito existen
        const projectsExists = await this.checkTableExists('projects');
        const usersExists = await this.checkTableExists('users');
        
        if (!projectsExists || !usersExists) {
          console.log('  ℹ️  Tablas prerequisito (projects/users) no existen (base de datos nueva), omitiendo creación de boards');
          return true; // Omitir este paso, drizzle creará todo
        }
        
        return false; // Tablas prerequisito existen pero boards no, necesitamos crearla
      },
      execute: async () => {
        console.log('  → Creando tabla boards...');
        await this.pool.query(`
          CREATE TABLE boards (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_by_id VARCHAR NOT NULL REFERENCES users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX boards_project_id_idx ON boards(project_id);
        `);
        console.log('  ✓ Tabla boards creada');
      }
    };
  }

  private createDefaultBoardsStep(): MigrationStep {
    return {
      name: 'Crear boards por defecto para proyectos',
      check: async () => {
        const boardsExist = await this.checkTableExists('boards');
        if (!boardsExist) {
          console.log('  ℹ️  Tabla boards no existe (se creará con drizzle), omitiendo creación de boards por defecto');
          return true; // Omitir este paso
        }
        
        const projectsExist = await this.checkTableExists('projects');
        if (!projectsExist) {
          console.log('  ℹ️  Tabla projects no existe (base de datos nueva), omitiendo creación de boards por defecto');
          return true; // Omitir este paso
        }
        
        // Verificar que TODOS los proyectos tienen al menos un board
        const result = await this.pool.query(`
          SELECT COUNT(*) as count 
          FROM projects p
          WHERE NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.project_id = p.id
          );
        `);
        // Si el count es 0, significa que todos los proyectos tienen boards
        return parseInt(result.rows[0].count) === 0;
      },
      execute: async () => {
        console.log('  → Creando boards por defecto...');
        const insertResult = await this.pool.query(`
          INSERT INTO boards (id, project_id, name, description, created_by_id, created_at)
          SELECT 
            gen_random_uuid(),
            p.id,
            'Tablero Principal',
            'Tablero principal del proyecto',
            p.created_by_id,
            NOW()
          FROM projects p
          WHERE NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.project_id = p.id
          );
        `);
        const rowCount = insertResult.rowCount || 0;
        console.log(`  ✓ ${rowCount} boards creados`);
      }
    };
  }

  private migrateProjectColumnsBoardIdStep(): MigrationStep {
    return {
      name: 'Migrar project_columns.board_id → project_id',
      check: async () => {
        // Primero verificar si la tabla existe
        const tableExists = await this.checkTableExists('project_columns');
        if (!tableExists) {
          console.log('  ℹ️  Tabla project_columns no existe (base de datos nueva), omitiendo migración');
          return true; // Retornar true para omitir este paso
        }
        
        const hasProjectId = await this.checkColumnExists('project_columns', 'project_id');
        const hasBoardId = await this.checkColumnExists('project_columns', 'board_id');
        // Ya está migrado si tiene project_id y NO tiene board_id
        return hasProjectId && !hasBoardId;
      },
      execute: async () => {
        console.log('  → Migrando project_columns...');
        
        // 1. Eliminar constraint antiguo PRIMERO (antes de renombrar)
        const hasOldConstraint = await this.checkConstraintExists('project_columns', 'project_columns_board_id_boards_id_fk');
        if (hasOldConstraint) {
          console.log('    • Eliminando constraint antiguo');
          await this.pool.query(`
            ALTER TABLE project_columns 
            DROP CONSTRAINT project_columns_board_id_boards_id_fk;
          `);
        }
        
        // 2. Renombrar columna
        const hasBoardId = await this.checkColumnExists('project_columns', 'board_id');
        if (hasBoardId) {
          console.log('    • Renombrando board_id → project_id');
          await this.pool.query(`
            ALTER TABLE project_columns RENAME COLUMN board_id TO project_id;
          `);
        }

        // 3. Actualizar valores (convertir board_id a project_id)
        console.log('    • Actualizando valores de project_id');
        await this.pool.query(`
          UPDATE project_columns pc
          SET project_id = b.project_id
          FROM boards b
          WHERE pc.project_id = b.id;
        `);

        // 4. Agregar nuevo constraint
        const hasNewConstraint = await this.checkConstraintExists('project_columns', 'project_columns_project_id_projects_id_fk');
        if (!hasNewConstraint) {
          console.log('    • Agregando nuevo constraint');
          await this.pool.query(`
            ALTER TABLE project_columns 
            ADD CONSTRAINT project_columns_project_id_projects_id_fk 
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
          `);
        }

        // 5. Actualizar índice
        const hasOldIndex = await this.checkIndexExists('unique_board_order');
        if (hasOldIndex) {
          console.log('    • Eliminando índice antiguo');
          await this.pool.query(`DROP INDEX unique_board_order;`);
        }

        const hasNewIndex = await this.checkIndexExists('unique_project_order');
        if (!hasNewIndex) {
          console.log('    • Creando índice único');
          await this.pool.query(`
            CREATE UNIQUE INDEX unique_project_order ON project_columns(project_id, "order");
          `);
        }

        console.log('  ✓ project_columns migrado correctamente');
      }
    };
  }

  private migrateTasksStatusToColumnIdStep(): MigrationStep {
    return {
      name: 'Migrar tasks.status → tasks.column_id',
      check: async () => {
        // Primero verificar si la tabla existe
        const tableExists = await this.checkTableExists('tasks');
        if (!tableExists) {
          console.log('  ℹ️  Tabla tasks no existe (base de datos nueva), omitiendo migración');
          return true; // Retornar true para omitir este paso
        }
        
        const hasColumnId = await this.checkColumnExists('tasks', 'column_id');
        const hasStatus = await this.checkColumnExists('tasks', 'status');
        return hasColumnId && !hasStatus;
      },
      execute: async () => {
        console.log('  → Migrando tasks...');

        // 1. Agregar columna column_id si no existe
        const hasColumnId = await this.checkColumnExists('tasks', 'column_id');
        if (!hasColumnId) {
          console.log('    • Agregando columna column_id');
          await this.pool.query(`ALTER TABLE tasks ADD COLUMN column_id VARCHAR;`);
        }

        // 2. Mapear status → column_id
        const hasStatus = await this.checkColumnExists('tasks', 'status');
        if (hasStatus) {
          console.log('    • Mapeando valores de status a column_id');
          
          // Mapeo de status a orden de columna
          // open -> orden 0 (Pendiente)
          // in_progress -> orden 1 (En Progreso)
          // closed -> orden 2 (Completada)
          await this.pool.query(`
            UPDATE tasks t
            SET column_id = (
              SELECT pc.id 
              FROM project_columns pc 
              WHERE pc.project_id = t.project_id 
              AND CASE 
                WHEN t.status = 'open' THEN pc."order" = 0
                WHEN t.status = 'in_progress' THEN pc."order" = 1
                WHEN t.status = 'closed' THEN pc."order" = 2
                ELSE pc."order" = 0
              END
              LIMIT 1
            )
            WHERE t.column_id IS NULL;
          `);
        }

        // 3. Verificar que todas las tareas tienen column_id
        const nullCount = await this.pool.query(`
          SELECT COUNT(*) as count FROM tasks WHERE column_id IS NULL;
        `);
        
        if (parseInt(nullCount.rows[0].count) > 0) {
          throw new Error(`${nullCount.rows[0].count} tareas no tienen column_id asignado`);
        }

        // 4. Hacer column_id NOT NULL
        const isNullable = await this.pool.query(`
          SELECT is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'tasks' AND column_name = 'column_id';
        `);
        
        if (isNullable.rows[0]?.is_nullable === 'YES') {
          console.log('    • Configurando column_id como NOT NULL');
          await this.pool.query(`ALTER TABLE tasks ALTER COLUMN column_id SET NOT NULL;`);
        }

        // 5. Agregar foreign key si no existe
        const hasConstraint = await this.checkConstraintExists('tasks', 'tasks_column_id_project_columns_id_fk');
        if (!hasConstraint) {
          console.log('    • Agregando foreign key constraint');
          await this.pool.query(`
            ALTER TABLE tasks
            ADD CONSTRAINT tasks_column_id_project_columns_id_fk
            FOREIGN KEY (column_id) REFERENCES project_columns(id) ON DELETE RESTRICT;
          `);
        }

        // 6. Eliminar columna status
        if (hasStatus) {
          console.log('    • Eliminando columna status');
          await this.pool.query(`ALTER TABLE tasks DROP COLUMN status;`);
        }

        console.log('  ✓ tasks migrado correctamente');
      }
    };
  }

  async runMigrations() {
    console.log('🚀 Iniciando migración automática de base de datos...\n');

    const steps: MigrationStep[] = [
      this.createBoardsTableStep(),
      this.createDefaultBoardsStep(),
      this.migrateProjectColumnsBoardIdStep(),
      this.migrateTasksStatusToColumnIdStep(),
    ];

    let completedSteps = 0;
    let skippedSteps = 0;

    for (const step of steps) {
      try {
        console.log(`📋 ${step.name}`);
        const alreadyDone = await step.check();
        
        if (alreadyDone) {
          console.log('  ⏭️  Ya completado, omitiendo...\n');
          skippedSteps++;
          continue;
        }

        await step.execute();
        completedSteps++;
        console.log('');
      } catch (error) {
        console.error(`\n❌ Error en paso "${step.name}":`);
        console.error(error);
        throw error;
      }
    }

    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Migración completada exitosamente!`);
    console.log(`   • Pasos completados: ${completedSteps}`);
    console.log(`   • Pasos omitidos (ya hechos): ${skippedSteps}`);
    console.log('═══════════════════════════════════════════════════\n');
  }

  async verify() {
    console.log('🔍 Verificando estado de la base de datos...\n');

    const checks = [
      {
        name: 'Tabla boards existe',
        check: async () => await this.checkTableExists('boards'),
      },
      {
        name: 'project_columns tiene column project_id',
        check: async () => await this.checkColumnExists('project_columns', 'project_id'),
      },
      {
        name: 'project_columns NO tiene columna board_id',
        check: async () => !(await this.checkColumnExists('project_columns', 'board_id')),
      },
      {
        name: 'tasks tiene columna column_id',
        check: async () => await this.checkColumnExists('tasks', 'column_id'),
      },
      {
        name: 'tasks NO tiene columna status',
        check: async () => !(await this.checkColumnExists('tasks', 'status')),
      },
      {
        name: 'Índice único unique_project_order existe',
        check: async () => await this.checkIndexExists('unique_project_order'),
      },
    ];

    let allPassed = true;

    for (const check of checks) {
      const passed = await check.check();
      const icon = passed ? '✅' : '❌';
      console.log(`${icon} ${check.name}`);
      if (!passed) allPassed = false;
    }

    console.log('');
    if (allPassed) {
      console.log('✅ Todas las verificaciones pasaron. La base de datos está correctamente migrada.\n');
    } else {
      console.log('❌ Algunas verificaciones fallaron. Ejecuta la migración.\n');
    }

    return allPassed;
  }

  async close() {
    await this.pool.end();
  }
}

async function main() {
  const migrator = new DatabaseMigrator();

  try {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'verify') {
      await migrator.verify();
    } else {
      // Verificar primero
      const isAlreadyMigrated = await migrator.verify();
      
      if (isAlreadyMigrated) {
        console.log('ℹ️  La base de datos ya está migrada. No hay nada que hacer.\n');
      } else {
        console.log('⚠️  La base de datos necesita migración. Iniciando...\n');
        await migrator.runMigrations();
        
        // Verificar después de migrar
        console.log('🔍 Verificando migración...\n');
        await migrator.verify();
      }
    }
  } catch (error) {
    console.error('\n❌ Error durante la migración:');
    console.error(error);
    process.exit(1);
  } finally {
    await migrator.close();
  }
}

main();
