import { defineConfig } from "drizzle-kit";

// Optional: `npx drizzle-kit generate` for SQL migrations. The app itself bootstraps tables from lib/db/ddl.ts.
const url = process.env.DATABASE_URL;
export default defineConfig(
  url
    ? { dialect: "postgresql", schema: "./lib/db/schema.pg.ts", out: "./drizzle/pg", dbCredentials: { url } }
    : { dialect: "sqlite", schema: "./lib/db/schema.sqlite.ts", out: "./drizzle/sqlite", dbCredentials: { url: process.env.SQLITE_PATH || "./governance-lens.db" } }
);
