import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

/**
 * With DATABASE_URL set (production: Neon, Supabase or any Postgres), connects over the network.
 * Without it, runs an embedded Postgres (PGlite) stored in .data/ so local development needs no setup.
 */
async function createDb(): Promise<Db> {
  // Vercel's Neon integration names the variable after the prefix chosen when connecting (DATABASE_ or STORAGE_).
  const url = process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.POSTGRES_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 3) });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    // Both drivers expose the same query builder API; the type difference is only in driver internals.
    return db as unknown as Db;
  }
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(path.dirname(dataDir), { recursive: true });
  return createPgliteDb(dataDir);
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}

const globalForDb = globalThis as unknown as { gmoneyDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  // A failed connection is forgotten so the next request tries again instead of failing forever.
  globalForDb.gmoneyDb ??= createDb().catch((err) => {
    globalForDb.gmoneyDb = undefined;
    throw err;
  });
  return globalForDb.gmoneyDb;
}

export { schema };
