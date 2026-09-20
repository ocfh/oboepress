import "server-only";
import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import { securityEvents } from "@/db/schema";
import { getAdminSecurity } from "./security";
import { ValidationError } from "./errors";

/**
 * 安全事件流水 + 登录失败限流。
 *
 * 限流模型：滑动窗口内「同一账号 或 同一 IP」的 login.fail 事件数达到阈值即
 * 暂时拒绝登录；窗口自然滑过后自动解锁，无需定时任务。统计与锁定共用
 * security_events 一张表，不额外引入计数器存储。
 */

export const SECURITY_EVENTS = {
  LOGIN_SUCCESS: "login.success",
  LOGIN_FAIL: "login.fail",
  LOGIN_LOCKED: "login.locked",
  RESET_REQUEST: "password.reset.request",
  RESET_DONE: "password.reset.done",
} as const;

/** 从反向代理头取真实客户端 IP（与评论 / 发码接口同一约定）。 */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return (
    (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null
  );
}

export function clientUa(req: Request): string | null {
  return req.headers.get("user-agent")?.slice(0, 500) || null;
}

export async function recordSecurityEvent(input: {
  eventType: string;
  userId?: number | null;
  account?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await ensureMigrations();
    await db.insert(securityEvents).values({
      eventType: input.eventType,
      userId: input.userId ?? null,
      account: input.account?.trim().slice(0, 120) || null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      detail: input.detail ?? null,
    });
  } catch (e) {
    // 审计写入失败不能阻断登录等主流程。
    console.error("[security-events] 写入失败：", e);
  }
}

/**
 * 登录前限流检查。未开启直接放行；窗口内失败数达到阈值则抛出
 * ValidationError（携带剩余解锁分钟数）。
 */
export async function assertLoginAllowed(
  account: string,
  ip: string | null,
): Promise<void> {
  const sec = await getAdminSecurity();
  if (!sec.throttleEnabled) return;

  const windowMs = sec.throttleWindowMinutes * 60_000;
  const since = new Date(Date.now() - windowMs);

  // 取窗口内最近的 N 条失败（N=阈值），账号或 IP 任一命中即计入。
  const cond = [
    eq(securityEvents.eventType, SECURITY_EVENTS.LOGIN_FAIL),
    gt(securityEvents.createdAt, since),
  ];
  const accountCond = account
    ? eq(securityEvents.account, account)
    : sql`false`;
  const ipCond = ip ? eq(securityEvents.ip, ip) : sql`false`;
  cond.push(or(accountCond, ipCond)!);

  const rows = await db
    .select({ createdAt: securityEvents.createdAt })
    .from(securityEvents)
    .where(and(...cond))
    .orderBy(desc(securityEvents.id))
    .limit(sec.throttleMaxFailures);

  if (rows.length >= sec.throttleMaxFailures) {
    // 滑动窗口：这批最早一次失败 + 窗口时长 = 解锁时刻。
    const oldest = rows[rows.length - 1].createdAt.getTime();
    const unlockAt = oldest + windowMs;
    const remainMs = unlockAt - Date.now();
    if (remainMs > 0) {
      const mins = Math.max(1, Math.ceil(remainMs / 60_000));
      throw new ValidationError(`登录失败次数过多，请 ${mins} 分钟后再试`);
    }
  }
}

export type SecurityEventRow = typeof securityEvents.$inferSelect;

/** 后台安全日志：分页列出最近事件。 */
export async function listSecurityEvents(opts?: {
  limit?: number;
  offset?: number;
  eventType?: string;
}): Promise<{ items: SecurityEventRow[]; total: number }> {
  await ensureMigrations();
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  const offset = Math.max(0, opts?.offset ?? 0);
  const cond = opts?.eventType
    ? eq(securityEvents.eventType, opts.eventType)
    : undefined;
  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(securityEvents)
      .where(cond)
      .orderBy(desc(securityEvents.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(securityEvents)
      .where(cond),
  ]);
  return { items, total: Number(totalRows[0]?.n ?? 0) };
}
