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
/**
 * True when a process with `pid` currently exists. signal 0 performs no
 * actual signal; ESRCH means gone, EPERM (Windows: access denied) still
 * proves the PID is live (and therefore must not be treated as stale).
 */
function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function sweepStalePgLocks(dataDir: string): void {
  try {
    const pidFile = path.join(dataDir, "postmaster.pid");
    if (!fs.existsSync(pidFile)) return;
    // A live owner means another dev/server process has THIS directory open.
    // Sweeping its locks and opening a second PGlite corrupts the pgdata
    // (WASM "Aborted()"), so fail loudly instead of "helpfully" destroying it.
    const holderPid = Number.parseInt(fs.readFileSync(pidFile, "utf8").split(/\r?\n/)[0] || "", 10);
    if (holderPid && pidIsAlive(holderPid)) {
      throw new Error(
        `PGlite data directory ${dataDir} is already in use by process ${holderPid}. ` +
          "Stop the other server (only one `next dev` can open this embedded DB) and retry. " +
          "If no server is actually running, delete postmaster.pid in that folder manually.",
      );
    }
    for (const name of fs.readdirSync(dataDir)) {
      if (name === "postmaster.pid" || name.startsWith(".s.PGSQL.")) {
        fs.rmSync(path.join(dataDir, name), { force: true });
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("PGlite data directory")) throw err;
    // Any other cleanup failure is best-effort; PGlite surfaces the real error.
  }
}

/**
 * Flush + release the embedded database when the process is asked to stop, so
 * a normal `next dev` shutdown never leaves half-written WAL / lock files
 * behind (which is what previously forced repeated data-directory rebuilds).
 * Registered once across dev hot-reloads via a global guard.
 */
function registerGracefulShutdown(): void {
  const g = globalThis as unknown as {
    __oboeDbShutdown?: boolean;
    __oboeDbClosing?: Promise<void>;
    __oboeDbCloseTarget?: PGlite | null;
  };
  if (g.__oboeDbShutdown) return;
  g.__oboeDbShutdown = true;

  // 必须真正 await 到 PGlite 写完 shutdown checkpoint（close 内部会做
  // CHECKPOINT 并同步 pg_control/WAL）。此前 fire-and-forget 的写法会让
  // 进程在落盘中途退出，曾导致 pg_control 检查点指针落进 WAL 记录体内、
  // 重启 PANIC "could not locate a valid checkpoint record" 的事故。
  // 按客户端实例缓存：运行时 reconfigureDatabase 换库后，新客户端仍会被关。
  const closeDb = (): Promise<void> => {
    if (!g.__oboeDbClosing || g.__oboeDbCloseTarget !== pgliteClient) {
      const client = pgliteClient;
      g.__oboeDbCloseTarget = client;
      g.__oboeDbClosing = (async () => {
        if (!client) return;
        await client.close();
        if (pgliteClient === client) pgliteClient = null;
      })().catch((err) => {
        // 关闭失败不再抛出（进程已在退出路径上），仅记录便于排查。
        console.error("[db] PGlite close error:", err);
      });
    }
    return g.__oboeDbClosing;
  };

  // 抢占到信号监听器链最前面：先等数据库落盘，再把信号重新发给进程，
  // 让 Next 自身注册的 SIGINT/SIGTERM 处理器完成 HTTP 服务优雅停止。
  const onSignal = (signal: NodeJS.Signals) => {
    const forceTimer = setTimeout(() => {
      // WASM 极端卡死时的兜底：宁可强退也不挂死停机流程。
      console.error("[db] PGlite close timed out, forcing exit.");
      process.exit(1);
    }, 8000);
    forceTimer.unref?.();
    void closeDb().finally(() => {
      clearTimeout(forceTimer);
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    });
  };
  process.prependOnceListener("SIGINT", () => onSignal("SIGINT"));
  process.prependOnceListener("SIGTERM", () => onSignal("SIGTERM"));
  // 事件循环自然排空（脚本类场景）时的最后机会，返回的 Promise 会让
  // Node 再跑一轮微任务，保证 close 真正执行完。
  process.once("beforeExit", () => {
    void closeDb();
  });
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

/**
 * 驱动无关的原始 SQL 入口：两种驱动的原生返回形状不同（postgres-js 直接
 * 返回行数组，PGlite 返回 { rows }），备份等需要按 information_schema 动态
 * 拼装 SQL 的场景统一在这里归一化为行数组。参数一律用 $1/$2 占位。
 */
export async function rawQuery<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  getDb();
  if (driver === "postgres" && postgresClient) {
    // postgres.js 对绑定参数有自己的联合类型；这里是透传原始 SQL 的边界，
    // 调用方（备份服务）保证只传 JSON 可序列化标量。
    return (await postgresClient.unsafe(query, params as never[])) as T[];
  }
  if (pgliteClient) {
    const res = await pgliteClient.query<T>(query, params);
    return res.rows;
  }
  throw new Error("数据库尚未初始化");
}

export { schema };
