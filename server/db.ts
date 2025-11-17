import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import pg from 'pg';
import ws from "ws";
import * as schema from "../shared/schema.js";

const { Pool: NodePool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect if we're using Neon (has neon.tech in URL) or regular PostgreSQL
const isNeon = process.env.DATABASE_URL.includes('neon.tech') || 
               process.env.DATABASE_URL.includes('postgresql.tools.svc.cluster.local');

let pool: NeonPool | InstanceType<typeof NodePool>;
let db: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzleNode>;

if (isNeon) {
  // Use Neon serverless driver for Neon databases
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon({ client: pool as NeonPool, schema });
  console.log('[Database] Using Neon serverless driver');
} else {
  // Use standard PostgreSQL driver for Docker/local databases
  pool = new NodePool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNode({ client: pool as InstanceType<typeof NodePool>, schema });
  console.log('[Database] Using standard PostgreSQL driver');
}

export { pool, db };
