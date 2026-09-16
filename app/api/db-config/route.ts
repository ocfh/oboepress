import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ok, fail } from "@/lib/http";
import { reconfigureDatabase } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENV_CONFIG = path.resolve(process.cwd(), ".env.local");

const schema = z.object({
  driver: z.enum(["pglite", "postgres"]),
  url: z.string().trim().optional(),
  // Local images (route A: commit/git + Vercel build) vs Vercel Blob (route B:
  // auto cloud upload on admin upload). Local keeps BLOB token unset so
  // lib/storage.ts falls back to content/uploads.
  storage: z.enum(["local", "vercel-blob"]).optional(),
  blobToken: z.string().trim().optional(),
});

async function verifyPostgres(url: string): Promise<string | null> {
  const postgres = (await import("postgres")).default;
  const client = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    await client`select version()`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    await client.end({ timeout: 2 });
  }
}

/** Merge key=value entries into .env.local, preserving unrelated lines. */
function writeEnvLocal(entries: Record<string, string>): void {
  const lines = fs.existsSync(ENV_CONFIG)
    ? fs.readFileSync(ENV_CONFIG, "utf8").split(/\r?\n/)
    : [];
  for (const [key, val] of Object.entries(entries)) {
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=`);
    const found = lines.findIndex((l) => re.test(l));
    if (found >= 0) lines[found] = `${key}=${val}`;
    else lines.push(`${key}=${val}`);
  }
  fs.mkdirSync(path.dirname(ENV_CONFIG), { recursive: true });
  fs.writeFileSync(ENV_CONFIG, lines.filter((l) => l.trim() !== "").join("\n") + "\n");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "), 422);
  }

  const { driver, url, storage, blobToken } = parsed.data;

  const entries: Record<string, string> = {};
  if (driver === "postgres") {
    if (!url) return fail("postgres 驱动需要提供连接串 DATABASE_URL", 422);
    const err = await verifyPostgres(url);
    if (err) return fail(`无法连接远程数据库：${err}`, 400);
    entries.DB_DRIVER = "postgres";
    entries.DATABASE_URL = url;
  } else {
    entries.DB_DRIVER = "pglite";
    entries.DATABASE_URL = "./.data/pglite_live";
  }

  if (storage === "vercel-blob") {
    if (!blobToken) return fail("选择 Vercel Blob 需要填写 BLOB_READ_WRITE_TOKEN", 422);
    entries.BLOB_READ_WRITE_TOKEN = blobToken;
  } else {
    // Route A (local): drop any existing token so storage.ts writes locally.
    entries.BLOB_READ_WRITE_TOKEN = "";
  }

  writeEnvLocal(entries);

  // Apply the chosen driver/URL to the *running* process so a subsequent
  // /api/setup in the same session writes straight to the target database —
  // no server restart needed. .env.local is still written so a future launch
  // boots with the same config.
  await reconfigureDatabase(
    driver,
    driver === "postgres" ? (url as string) : "./.data/pglite_live",
  );

  return ok({
    driver,
    storage: storage ?? "local",
  });
}