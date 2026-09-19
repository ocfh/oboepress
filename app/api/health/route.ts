import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 健康检查（供监控 / 负载均衡探活）：只做一次最轻量的 DB 往返，
 * 不暴露任何环境信息，无需鉴权。
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, time: new Date().toISOString() });
  } catch {
    return Response.json(
      { ok: false, time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
