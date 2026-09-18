import "server-only";
import crypto from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import { verifyCodes } from "@/db/schema";
import { getServerSecret } from "@/lib/auth";
import { ValidationError } from "./errors";

/**
 * 邮箱 / 短信验证码的签发与校验（注册、找回密码、绑定手机/邮箱等场景共用）。
 *
 * 安全约定：
 * - 库存的永远是 HMAC-SHA256 摘要（密钥取服务器 AUTH_SECRET），6 位数字本身
 *   不可经库泄露反推；
 * - 10 分钟有效、同一目标 60 秒才能重发（旧码在新码签发时即作废旧码，保证
 *   “最新一封短信/邮件”才有效，与主流站点一致）；
 * - 单码最多错 5 次；同一 IP 每小时最多签发 20 条，防爆短信/爆邮箱；
 * - 校验成功立即标记 consumed，单次有效。
 */

const TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const IP_HOUR_CAP = 20;

export type CodeChannel = "email" | "sms";
export type CodePurpose = "register" | "reset" | "bind" | "login";

function hashCode(code: string): string {
  return crypto
    .createHmac("sha256", Buffer.from(getServerSecret()))
    .update(code)
    .digest("hex");
}

export interface IssueCodeInput {
  channel: CodeChannel;
  target: string;
  purpose: CodePurpose;
  ip?: string | null;
}

/** 签发新验证码，返回明文码（仅用于即刻投递，绝不入库明文）。 */
export async function issueCode(input: IssueCodeInput): Promise<string> {
  await ensureMigrations();
  const now = new Date();

  // 同目标同用途 60 秒频控：最近一条未消费验证码签发未满 60 秒才拦截。
  // 投递失败时调用方会把该码标记消费，用户因此可以立刻重试，不必干等 60 秒；
  // 超过 60 秒正常重发，旧码在下方统一作废。
  const [live] = await db
    .select({ createdAt: verifyCodes.createdAt })
    .from(verifyCodes)
    .where(
      and(
        eq(verifyCodes.target, input.target),
        eq(verifyCodes.channel, input.channel),
        eq(verifyCodes.purpose, input.purpose),
        isNull(verifyCodes.consumedAt),
      ),
    )
    .orderBy(desc(verifyCodes.id))
    .limit(1);
  if (live && now.getTime() - live.createdAt.getTime() < RESEND_MS) {
    throw new ValidationError("发送太频繁，请 1 分钟后再试");
  }

  // IP 小时配额（无 IP 信息时跳过，不影响正常反代部署）。
  if (input.ip) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(verifyCodes)
      .where(
        and(
          eq(verifyCodes.ip, input.ip),
          gt(verifyCodes.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
        ),
      );
    if ((row?.n ?? 0) >= IP_HOUR_CAP) {
      throw new ValidationError("请求过于频繁，请稍后再试");
    }
  }

  // 旧码作废：同一目标/用途只允许最新一条未消费记录有效。
  await db
    .update(verifyCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(verifyCodes.target, input.target),
        eq(verifyCodes.channel, input.channel),
        eq(verifyCodes.purpose, input.purpose),
        isNull(verifyCodes.consumedAt),
      ),
    );

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(verifyCodes).values({
    target: input.target,
    channel: input.channel,
    purpose: input.purpose,
    codeHash: hashCode(code),
    expiresAt: new Date(now.getTime() + TTL_MS),
    ip: input.ip ?? null,
  });
  return code;
}

/** 作废旧码：投递失败时回滚用，避免用户被 60 秒频控锁死。 */
export async function invalidateLatestCode(input: IssueCodeInput): Promise<void> {
  const [row] = await db
    .select({ id: verifyCodes.id })
    .from(verifyCodes)
    .where(
      and(
        eq(verifyCodes.target, input.target),
        eq(verifyCodes.channel, input.channel),
        eq(verifyCodes.purpose, input.purpose),
        isNull(verifyCodes.consumedAt),
      ),
    )
    .orderBy(desc(verifyCodes.id))
    .limit(1);
  if (row) {
    await db
      .update(verifyCodes)
      .set({ consumedAt: new Date() })
      .where(eq(verifyCodes.id, row.id));
  }
}

export interface VerifyCodeInput {
  channel: CodeChannel;
  target: string;
  purpose: CodePurpose;
  code: string;
}

/**
 * 校验验证码。成功返回 true 并消费；任何失败均抛 ValidationError，
 * 由调用方直接透传消息。过期 / 不存在统一报“验证码错误或已过期”，
 * 不暴露该目标是否真的发过码。
 */
export async function verifyCode(input: VerifyCodeInput): Promise<true> {
  const value = input.code.trim();
  if (!/^\d{4,8}$/.test(value)) {
    throw new ValidationError("验证码错误或已过期");
  }
  const [row] = await db
    .select()
    .from(verifyCodes)
    .where(
      and(
        eq(verifyCodes.target, input.target),
        eq(verifyCodes.channel, input.channel),
        eq(verifyCodes.purpose, input.purpose),
        isNull(verifyCodes.consumedAt),
      ),
    )
    .orderBy(desc(verifyCodes.id))
    .limit(1);

  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("验证码错误或已过期");
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new ValidationError("验证码错误次数过多，请重新获取");
  }

  if (row.codeHash !== hashCode(value)) {
    await db
      .update(verifyCodes)
      .set({ attempts: sql`${verifyCodes.attempts} + 1` })
      .where(eq(verifyCodes.id, row.id));
    throw new ValidationError("验证码错误或已过期");
  }

  await db
    .update(verifyCodes)
    .set({ consumedAt: new Date() })
    .where(eq(verifyCodes.id, row.id));
  return true;
}
