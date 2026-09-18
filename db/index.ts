import fs from "node:fs";
import path from "node:path";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Dual-driver lazy database client.
 *
 *  - Local / zero-config:  `DB_DRIVER=pglite` (default) runs an in-process
 *    Postgres (WASM, @electric-sql/pglite) backed by a local directory. No
 *    Docker, no external server — `npm run dev` just works with plain Node.
 *  - Production (Vercel):  `DB_DRIVER=postgres` + `DATABASE_URL` uses a real
 *    Postgres connection (Neon / Vercel Postgres). `max: 1` keeps serverless
 *    invocations from exhausting connection slots.
 *
 * The connection is created on first *use*, never at module import, so
 * `next build` stays clean and cold serverless imports don't open sockets early.
 */

type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __oboeDb?: Database;
  __oboeMigrated?: Promise<void>;
};

type Driver = "pglite" | "postgres";

let driver: Driver = (process.env.DB_DRIVER || "pglite") as Driver;
// Internal handles so we can run driver-specific migrations once at startup.
let pgliteClient: PGlite | null = null;
let postgresClient: ReturnType<typeof postgres> | null = null;

/**
 * Remove crash-residue Postgres lock files before (re)opening an embedded
 * data directory. PGlite is an in-process single-tenant Postgres: when a
 * fresh process is constructing a client, no other postmaster can possibly be
 * running against this directory, so an existing postmaster.pid / socket lock
 * always means the previous process was killed hard. Opening the directory
 * without removing them aborts the WASM runtime ("Aborted()" at _pg_initdb).
 */
function sweepStalePgLocks(dataDir: string): void {
  try {
    if (!fs.existsSync(path.join(dataDir, "postmaster.pid"))) return;
    for (const name of fs.readdirSync(dataDir)) {
      if (name === "postmaster.pid" || name.startsWith(".s.PGSQL.")) {
        fs.rmSync(path.join(dataDir, name), { force: true });
      }
    }
  } catch {
    // Best-effort cleanup; the PGlite constructor still surfaces a real error.
  }
}

/**
 * Flush + release the embedded database when the process is asked to stop, so
 * a normal `next dev` shutdown never leaves half-written WAL / lock files
 * behind (which is what previously forced repeated data-directory rebuilds).
 * Registered once across dev hot-reloads via a global guard.
 */
function registerGracefulShutdown(): void {
  const g = globalThis as unknown as { __oboeDbShutdown?: boolean };
  if (g.__oboeDbShutdown) return;
  g.__oboeDbShutdown = true;
  let closing = false;
  const flush = () => {
    if (closing) return;
    closing = true;
    // Fire-and-forget: do not block or re-exit; the runtime's own signal
    // handling owns process termination.
    pgliteClient?.close().catch(() => {});
  };
  process.once("SIGINT", flush);
  process.once("SIGTERM", flush);
  process.once("beforeExit", flush);
}

function createDb(): Database {
  driver = (process.env.DB_DRIVER || "pglite") as Driver;

  if (driver === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Provide a Postgres connection string for DB_DRIVER=postgres.",
      );
    }
    const client = postgres(connectionString, {
      max: Number(process.env.POSTGRES_MAX || 1),
      prepare: false,
    });
    postgresClient = client;
    return drizzle(client, { schema });
  }

  // pglite: embedded Postgres, persisted to a local directory by default.
  // NOTE: the fallback points at the valid embedded DB. Never fall back to
  // ./data/oboepress — that path was polluted by a native Postgres initdb and
  // is incompatible with pglite (opening it aborts the WASM with "Aborted()").
  const url = process.env.DATABASE_URL || "./.data/pglite_live";
  // PGlite's own directory creation is not recursive; make sure the parent
  // data directory exists so the first launch is truly zero-config.
  fs.mkdirSync(path.dirname(path.resolve(url)), { recursive: true });
  sweepStalePgLocks(path.resolve(url));
  // relaxedDurability skips fsync on every transaction: the embedded local
  // store is disposable/dev-grade (production uses the postgres driver), and
  // fewer filesystem syncs both speed up writes and shrink the window in
  // which a hard process kill can tear the data directory.
  const client = new PGlite(url, { relaxedDurability: true });
  pgliteClient = client;
  registerGracefulShutdown();
  // drizzle-orm/pglite returns a PgDatabase-compatible instance; the query API
  // is identical to the postgres-js one, so we unify the type for callers.
  return drizzlePglite(client, { schema }) as unknown as Database;
}

function getDb(): Database {
  if (!globalForDb.__oboeDb) {
    globalForDb.__oboeDb = createDb();
  }
  return globalForDb.__oboeDb;
}

/**
 * Apply SQL migrations exactly once per process. For the local pglite driver
 * this makes startup truly zero-config: the first request opens the embedded
 * DB and creates every table automatically (no `db:migrate` step required).
 *
 * For the postgres driver we auto-migrate too, so the first request against a
 * fresh remote database (e.g. Neon on a first Vercel deploy) creates every
 * table without needing to run `npm run db:migrate` manually. Migrations are
 * idempotent — drizzle records each applied migration in `__drizzle_migrations`
 * and skips those already run — so concurrent serverless instances that both
 * hit the empty schema just apply the same changes safely. Schema changes
 * after the first deploy are still best applied via `npm run db:migrate`.
 *
 * The promise is cached on globalThis so concurrent first requests coalesce
 * into a single migration run (important under Next dev hot-reload).
 */
/**
 * Switch the active database at runtime (used by first-run setup when the user
 * picks "remote database"). Mutates `process.env` and drops every cached handle,
 * so the next `getDb()` builds a fresh client against the new target — no server
 * restart required. The previous client is closed first to avoid leaking a socket
 * or file handle back onto a database we just left.
 *
 * Because `process.env` is process-global and persists across requests in a dev
 * server, a subsequent `/api/setup` call in the same process writes straight to
 * the newly configured database. (On Vercel serverless each request may be a new
 * instance and env is set via the dashboard — the install wizard targets local
 * dev, which is exactly where this one-shot switch is needed.)
 */
export async function reconfigureDatabase(driver: Driver, url: string): Promise<void> {
  process.env.DB_DRIVER = driver;
  process.env.DATABASE_URL =
    driver === "postgres" ? url : url || "./.data/pglite_live";

  // Best-effort teardown of the previously opened client(s) so the switch
  // doesn't leave stale handles behind. The new client is independent.
  try {
    if (postgresClient) await postgresClient.end({ timeout: 2 });
    if (pgliteClient) await pgliteClient.close();
  } catch {
    // ignore teardown errors — a fresh client is created regardless
  }
  postgresClient = null;
  pgliteClient = null;
  globalForDb.__oboeDb = undefined;
  globalForDb.__oboeMigrated = undefined;
}

export function ensureMigrations(): Promise<void> {
  if (!globalForDb.__oboeMigrated) {
    globalForDb.__oboeMigrated = (async () => {
      getDb(); // ensure client + driver are initialised
      const folder = path.resolve(process.cwd(), "db/migrations");
      if (driver === "postgres" && postgresClient) {
        const pg = drizzle(postgresClient, { schema });
        await migratePostgres(pg, { migrationsFolder: folder });
      } else if (pgliteClient) {
        const pg = drizzlePglite(pgliteClient, { schema });
        await migratePglite(pg, { migrationsFolder: folder });
      }
    })().catch((err) => {
      // Reset so a later request can retry instead of caching the failure.
      globalForDb.__oboeMigrated = undefined;
      throw err;
    });
  }
  return globalForDb.__oboeMigrated;
}

/**
 * Proxy so callers keep using `db.select(...)` while the instance is created
 * lazily on first access.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
}) as Database;

export { schema };
