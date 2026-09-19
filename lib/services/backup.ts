/**
 * 整库级逻辑备份与恢复（驱动无关，pglite / postgres 通用）。
 *
 * 与 app/api/admin/export 的「内容导出」不同：这里按 information_schema
 * 动态枚举 public 下全部业务表，整行原样备份（用户、设置、插件、会员、
 * 安全日志等无一遗漏），恢复时在单事务内 TRUNCATE + jsonb_to_recordset
 * 批量导回，并把自增序列拨到 max(id)，保证整库可回到备份时刻的状态。
 *
 * 有意不备份 __drizzle_migrations：它只记录结构迁移版本，结构由当前
 * 程序自带的 migrations 管理，恢复旧备份不能把结构也「降回去」。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, rawQuery } from "@/db";
import { bumpAll } from "./public-cache";
import { invalidateOptionCache } from "./options";
import { reloadPlugins } from "./plugins";
import { ServiceError } from "./errors";

export const BACKUP_KIND = "oboepress-db-backup";
const BACKUP_VERSION = 1;
const SKIP_TABLES = new Set(["__drizzle_migrations"]);

/** 恢复前自动快照目录与保留份数（本地内嵌库的安全网，best-effort）。 */
const AUTO_DIR = path.resolve(process.cwd(), ".data/backups");
const AUTO_PREFIX = "auto-before-restore-";
const AUTO_KEEP = 10;

export interface DatabaseBackup {
  tool: "OboePress";
  kind: typeof BACKUP_KIND;
  version: number;
  createdAt: string;
  /** 表名 -> 原始行（值为数据库直出，Date/JSONB 由 JSON 序列化自然处理）。 */
  tables: Record<string, Record<string, unknown>[]>;
}

export interface RestoreResult {
  /** 实际导入的表 -> 行数。 */
  restored: Record<string, number>;
  /** 备份里存在、当前库结构中已不存在而跳过的表。 */
  missingTables: string[];
  /** 表 -> 备份中存在但当前表已删除的列（自动丢弃，不阻断恢复）。 */
  droppedColumns: Record<string, string[]>;
  /** 恢复前自动快照落盘路径（仅本地可写时有值）。 */
  autoSnapshot?: string;
}

interface ColumnMeta {
  name: string;
  /** 可直接写进 jsonb_to_recordset(...) AS 定义的 PG 类型名。 */
  type: string;
}
interface TableMeta {
  name: string;
  columns: ColumnMeta[];
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * 读取 public 下全部业务表及列定义。udt_name 是规范 PG 类型名
 * （int4/timestamptz/jsonb/bool/枚举名……），可直接充当 recordset 列类型；
 * 数组类型 data_type='ARRAY'，udt_name 为 _text/_int4 等内部数组类型名，
 * 同样是合法 SQL 类型名。varchar 长度对解析输入无影响，无需带出。
 */
async function listTableMetas(): Promise<TableMeta[]> {
  const rows = await rawQuery<{
    table_name: string;
    ordinal: number;
    column_name: string;
    data_type: string;
    udt_name: string;
  }>(`
    SELECT c.table_name,
           c.ordinal_position::int AS ordinal,
           c.column_name,
           c.data_type,
           c.udt_name
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_name = t.table_name AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `);
  const map = new Map<string, TableMeta>();
  for (const r of rows) {
    if (SKIP_TABLES.has(r.table_name)) continue;
    let t = map.get(r.table_name);
    if (!t) {
      t = { name: r.table_name, columns: [] };
      map.set(r.table_name, t);
    }
    t.columns.push({ name: r.column_name, type: r.data_type === "ARRAY" ? r.udt_name : r.udt_name });
  }
  return [...map.values()];
}

export async function buildDatabaseBackup(): Promise<DatabaseBackup> {
  const metas = await listTableMetas();
  const tables: DatabaseBackup["tables"] = {};
  for (const t of metas) {
    const rows = await rawQuery(`SELECT * FROM ${quoteIdent(t.name)}`);
    tables[t.name] = rows as Record<string, unknown>[];
  }
  return {
    tool: "OboePress",
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  };
}

/**
 * 依外键依赖做拓扑排序：父表先于子表导入。自引用 FK（父子评论/菜单）
 * 不参与排序——行数据在 INSERT 前按数字 id 升序，保证父行先落库。
 */
async function fkOrder(names: Set<string>): Promise<string[]> {
  const edges = await rawQuery<{ child: string; parent: string }>(`
    SELECT cl.relname AS child, cr.relname AS parent
    FROM pg_constraint k
    JOIN pg_class cl ON cl.oid = k.conrelid
    JOIN pg_namespace nl ON nl.oid = cl.relnamespace
    JOIN pg_class cr ON cr.oid = k.confrelid
    JOIN pg_namespace nr ON nr.oid = cr.relnamespace
    WHERE k.contype = 'f' AND nl.nspname = 'public' AND nr.nspname = 'public'
  `);
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of names) {
    indegree.set(n, 0);
    adjacency.set(n, []);
  }
  for (const { child, parent } of edges) {
    if (child === parent) continue; // 自引用交行排序处理
    if (!names.has(child) || !names.has(parent)) continue;
    adjacency.get(parent)!.push(child);
    indegree.set(child, (indegree.get(child) ?? 0) + 1);
  }
  const queue = [...names].filter((n) => (indegree.get(n) ?? 0) === 0).sort();
  const ordered: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    ordered.push(n);
    for (const child of adjacency.get(n) ?? []) {
      const d = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, d);
      if (d === 0) queue.push(child);
    }
  }
  // 理论上业务表无外键环；万一存在，剩余表按名追加，交由数据库报错。
  for (const n of [...names].sort()) if (!ordered.includes(n)) ordered.push(n);
  return ordered;
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

/** 恢复前把当前库快照写到 .data/backups，失败不阻断恢复。 */
async function writeAutoSnapshot(): Promise<string | undefined> {
  try {
    await fs.mkdir(AUTO_DIR, { recursive: true });
    const file = path.join(AUTO_DIR, `${AUTO_PREFIX}${stamp()}.json`);
    const snap = await buildDatabaseBackup();
    await fs.writeFile(file, JSON.stringify(snap), "utf-8");
    // 仅保留最新 AUTO_KEEP 份自动快照。
    const all = (await fs.readdir(AUTO_DIR))
      .filter((f) => f.startsWith(AUTO_PREFIX) && f.endsWith(".json"))
      .sort()
      .reverse();
    await Promise.all(all.slice(AUTO_KEEP).map((f) => fs.rm(path.join(AUTO_DIR, f), { force: true })));
    return file;
  } catch (err) {
    console.warn("[backup] 恢复前自动快照失败（已忽略）:", err);
    return undefined;
  }
}

function assertBackup(input: unknown): DatabaseBackup {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError("备份文件不是合法对象", 400);
  }
  const b = input as Partial<DatabaseBackup>;
  if (b.kind !== BACKUP_KIND) {
    throw new ServiceError("文件格式不是 OboePress 整库备份", 400);
  }
  if (b.version !== 1 || typeof b.tables !== "object" || b.tables === null) {
    throw new ServiceError("备份文件缺少版本号或数据表", 400);
  }
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!Array.isArray(rows) || rows.some((r) => typeof r !== "object" || r === null)) {
      throw new ServiceError(`表 ${name} 的备份数据结构非法`, 400);
    }
  }
  return b as DatabaseBackup;
}

export async function restoreDatabaseBackup(input: unknown): Promise<RestoreResult> {
  const backup = assertBackup(input);
  const backupTables = Object.keys(backup.tables);
  const metas = await listTableMetas();
  const metaByName = new Map(metas.map((t) => [t.name, t]));

  const missingTables: string[] = [];
  const present = new Set<string>();
  for (const name of backupTables) {
    if (metaByName.has(name)) present.add(name);
    else missingTables.push(name);
  }
  const droppedColumns: Record<string, string[]> = {};
  for (const name of present) {
    const currentCols = new Set(metaByName.get(name)!.columns.map((c) => c.name));
    const inBackup = new Set(
      Object.keys((backup.tables[name] as Record<string, unknown>[])[0] ?? {}),
    );
    const gone = [...inBackup].filter((c) => !currentCols.has(c));
    if (gone.length) droppedColumns[name] = gone;
  }

  // 破坏性操作前先在服务器本地留一份当前库快照。
  const autoSnapshot = await writeAutoSnapshot();

  const ordered = await fkOrder(present);
  // RESTART IDENTITY 已把序列归零；记录所有自增列，导完后统一拨到 max。
  const sequences = await rawQuery<{ table_name: string; column_name: string; seq: string }>(`
    SELECT table_name, column_name,
           pg_get_serial_sequence(quote_ident(table_name), column_name) AS seq
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval%'
  `);

  await db.transaction(async (tx) => {
    if (ordered.length) {
      // 单语句多表 TRUNCATE + CASCADE：删除顺序不再受外键约束影响。
      const list = ordered.map(quoteIdent).join(", ");
      await tx.execute(sql`TRUNCATE TABLE ${sql.raw(list)} RESTART IDENTITY CASCADE`);
    }

    for (const name of ordered) {
      const rows = backup.tables[name];
      if (!rows.length) continue;
      const meta = metaByName.get(name)!;
      const cols = meta.columns;
      const colCsv = cols.map((c) => quoteIdent(c.name)).join(", ");
      const defs = cols.map((c) => `${quoteIdent(c.name)} ${c.type}`).join(", ");
      // 只导当前结构仍存在的列；行按数字 id 升序（无 id 则原序）。
      const sorted = [...rows].sort((a, b) => {
        const x = Number(a.id);
        const y = Number(b.id);
        if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
        return 0;
      });
      const picked = sorted.map((r) => {
        const out: Record<string, unknown> = {};
        for (const c of cols) out[c.name] = r[c.name] ?? null;
        return out;
      });
      await tx.execute(sql`
        INSERT INTO ${sql.raw(quoteIdent(name))} (${sql.raw(colCsv)})
        SELECT ${sql.raw(colCsv)}
        FROM jsonb_to_recordset((${JSON.stringify(picked)})::jsonb)
          AS (${sql.raw(defs)})
      `);
    }

    // 显式 id 导回后必须校正序列，否则新建数据会从 1 开始撞主键。
    for (const s of sequences) {
      if (!present.has(s.table_name) || !s.seq) continue;
      await tx.execute(sql`
        SELECT setval(
          ${s.seq},
          GREATEST(COALESCE((SELECT MAX(${sql.raw(quoteIdent(s.column_name))}) FROM ${sql.raw(
            quoteIdent(s.table_name),
          )}), 1), 1),
          (SELECT MAX(${sql.raw(quoteIdent(s.column_name))}) FROM ${sql.raw(
            quoteIdent(s.table_name),
          )}) IS NOT NULL
        )
      `);
    }
  });

  // 绕过服务层直接改了全部表：公开缓存、options 缓存作废，插件按新表重载。
  bumpAll();
  invalidateOptionCache();
  await reloadPlugins();

  const restored: Record<string, number> = {};
  for (const name of ordered) restored[name] = backup.tables[name].length;
  return { restored, missingTables, droppedColumns, autoSnapshot };
}
