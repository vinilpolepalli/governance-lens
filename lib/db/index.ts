import path from "node:path";
import * as sqliteSchema from "./schema.sqlite";
import * as pgSchema from "./schema.pg";
import { PG_DDL, PG_MIGRATIONS, SQLITE_DDL, SQLITE_OWNER_TABLES } from "./ddl";
import { seedIfEmpty } from "./seed";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Dev: local SQLite file (SQLITE_PATH, default ./governance-lens.db) via better-sqlite3.
 * Prod: Postgres when DATABASE_URL is set. The Postgres tables are typed as their SQLite
 * twins: both query builders expose the same awaited API, which is all repo.ts uses.
 */
export type Db = BetterSQLite3Database<typeof sqliteSchema>;
export type Schema = typeof sqliteSchema;
export interface Conn {
  kind: "sqlite" | "postgres";
  db: Db;
  schema: Schema;
}

const g = globalThis as unknown as { __glDb?: Promise<Conn> };

async function open(): Promise<Conn> {
  const url = process.env.DATABASE_URL;
  let conn: Conn;
  if (url) {
    const [{ default: postgres }, { drizzle }] = await Promise.all([import("postgres"), import("drizzle-orm/postgres-js")]);
    const client = postgres(url, { max: 5, onnotice: () => {} });
    for (const stmt of PG_DDL) await client.unsafe(stmt);
    for (const stmt of PG_MIGRATIONS) await client.unsafe(stmt);
    conn = { kind: "postgres", db: drizzle(client, { schema: pgSchema }) as unknown as Db, schema: pgSchema as unknown as Schema };
  } else {
    const [{ default: Database }, { drizzle }] = await Promise.all([import("better-sqlite3"), import("drizzle-orm/better-sqlite3")]);
    const file = process.env.SQLITE_PATH || path.join(process.cwd(), "governance-lens.db");
    const sqlite = new Database(file);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    for (const stmt of SQLITE_DDL) sqlite.exec(stmt);
    for (const t of SQLITE_OWNER_TABLES) {
      const cols = sqlite.pragma(`table_info(${t})`) as { name: string }[];
      if (!cols.some((c) => c.name === "owner_id")) sqlite.exec(`ALTER TABLE ${t} ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'system'`);
    }
    conn = { kind: "sqlite", db: drizzle(sqlite, { schema: sqliteSchema }), schema: sqliteSchema };
  }
  await seedIfEmpty(conn);
  return conn;
}

export function getConn(): Promise<Conn> {
  if (!g.__glDb) {
    g.__glDb = open().catch((e) => {
      g.__glDb = undefined; // allow retry after a failed open
      throw e;
    });
  }
  return g.__glDb;
}
