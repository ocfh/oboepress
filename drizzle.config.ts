import { defineConfig } from "drizzle-kit";

/**
 * `generate` is offline (reads the schema, no DB connection). `push` targets a
 * real Postgres (Vercel / Neon) for production. Local pglite migrations are
 * applied by `db/migrate.ts` (npm run db:migrate), which opens pglite directly
 * and does not rely on drizzle-kit's push driver.
 */
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://localhost:5432/oboe-press",
  },
  verbose: true,
  strict: true,
});
