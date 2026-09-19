import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import { plugins, users } from "@/db/schema";
import {
  getServerSecret,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth";
import { deleteOption, getOption, setOption } from "./options";
import { ServiceError } from "./errors";
import {
  buildOtpauthUrl,
  generateRecoveryCodes,
  generateSecret,
  normalizeRecoveryCode,
  verifyTotp,
} from "./totp";

/**
 * 两步验证（TOTP）状态服务。
 *
 * 存储走通用 options KV（key = twofa:user:<id>），插件免建表：
 *   { v, secret(Base32), enabled, recovery: [{h(HMAC哈希), usedAt}] }
 * 恢复码只存哈希（HMAC-SHA256，密钥为服务器 AUTH_SECRET），明文仅在
 * 绑定确认/重置恢复码那一刻返回一次。
 */

export const TWOFA_PLUGIN_SLUG = "two-factor";
const ISSUER = "OboePress";
const RECOVERY_COUNT = 20;

type RecoveryRecord = { h: string; usedAt: string | null };

export type TwoFaState = {
  v: 1;
  secret: string;
  /** false = 已生成待确认的密钥；确认成功后置 true 才参与登录拦截。 */
  enabled: boolean;
  recovery: RecoveryRecord[];
  createdAt: string;
};

const storeKey = (userId: number) => `twofa:user:${userId}`;

/** 插件是否启用——登录链路上的唯一额外查询（slug 有唯一索引）。 */
export async function isTwoFactorPluginEnabled(): Promise<boolean> {
  await ensureMigrations();
  const [row] = await db
    .select({ enabled: plugins.enabled })
    .from(plugins)
    .where(eq(plugins.slug, TWOFA_PLUGIN_SLUG));
  return !!row?.enabled;
}

export async function getTwoFaState(
  userId: number,
): Promise<TwoFaState | null> {
  return (await getOption<TwoFaState | null>(storeKey(userId), null)) ?? null;
}

/** 恢复码哈希：HMAC-SHA256(服务器密钥, 归一化码)，落库的不可逆形态。 */
function hashRecoveryCode(code: string): string {
  return crypto
    .createHmac("sha256", getServerSecret())
    .update(`twofa-recovery:${normalizeRecoveryCode(code)}`)
    .digest("hex");
}

function timingEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** 第一步：生成待确认密钥与 otpauth 配置 URI（重复调用会作废旧密钥）。 */
export async function beginEnrollment(user: SessionUser): Promise<{
  secret: string;
  otpauth: string;
}> {
  const secret = generateSecret();
  const state: TwoFaState = {
    v: 1,
    secret,
    enabled: false,
    recovery: [],
    createdAt: new Date().toISOString(),
  };
  await setOption(storeKey(user.id), state);
  const label = user.email || user.name || `user-${user.id}`;
  return { secret, otpauth: buildOtpauthUrl(label, secret, ISSUER) };
}

/** 第二步：用验证器里的首组动态码确认绑定，成功即签发 20 个恢复码。 */
export async function confirmEnrollment(
  user: SessionUser,
  code: string,
): Promise<string[]> {
  const state = await getTwoFaState(user.id);
  if (!state || state.enabled) {
    throw new ServiceError("请先开始绑定流程", 400);
  }
  if (!verifyTotp(state.secret, code)) {
    throw new ServiceError("动态码不正确，请确认手机时间是否准确", 400);
  }
  const codes = generateRecoveryCodes(RECOVERY_COUNT);
  state.enabled = true;
  state.recovery = codes.map((c) => ({ h: hashRecoveryCode(c), usedAt: null }));
  await setOption(storeKey(user.id), state);
  return codes;
}

export type TwoFaStatus = {
  enabled: boolean;
  /** 已完成绑定（存在待确认密钥时前台可提示继续绑定）。 */
  pending: boolean;
  recoveryRemaining: number;
};

export async function getTwoFaStatus(user: SessionUser): Promise<TwoFaStatus> {
  const state = await getTwoFaState(user.id);
  return {
    enabled: !!state?.enabled,
    pending: !!state && !state.enabled,
    recoveryRemaining:
      state?.recovery.filter((r) => r.usedAt === null).length ?? 0,
  };
}

/**
 * 登录第二步校验：6 位纯数字走 TOTP（±1 时间窗）；其余按恢复码处理，
 * 命中的恢复码立即标记已用（一次性）。
 */
export async function verifyTwoFaCode(
  userId: number,
  rawCode: string,
): Promise<boolean> {
  const state = await getTwoFaState(userId);
  if (!state?.enabled) return false;
  const code = String(rawCode ?? "").trim();

  if (/^\d{6}$/.test(code)) {
    return verifyTotp(state.secret, code);
  }

  const h = hashRecoveryCode(code);
  const idx = state.recovery.findIndex(
    (r) => r.usedAt === null && timingEqualHex(r.h, h),
  );
  if (idx === -1) return false;
  state.recovery[idx] = { ...state.recovery[idx], usedAt: new Date().toISOString() };
  await setOption(storeKey(userId), state);
  return true;
}

/** 关闭两步验证：要求再次输入登录密码，防止会话被借用后直接解绑。 */
export async function disableTwoFa(
  user: SessionUser,
  password: string,
): Promise<void> {
  await ensureMigrations();
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id));
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new ServiceError("登录密码不正确", 400);
  }
  await deleteOption(storeKey(user.id));
}

/** 重新生成 20 个恢复码：必须持有当前 TOTP 动态码。 */
export async function regenerateRecoveryCodes(
  user: SessionUser,
  code: string,
): Promise<string[]> {
  const state = await getTwoFaState(user.id);
  if (!state?.enabled) throw new ServiceError("尚未启用两步验证", 400);
  if (!verifyTotp(state.secret, code)) {
    throw new ServiceError("动态码不正确", 400);
  }
  const codes = generateRecoveryCodes(RECOVERY_COUNT);
  state.recovery = codes.map((c) => ({ h: hashRecoveryCode(c), usedAt: null }));
  await setOption(storeKey(user.id), state);
  return codes;
}
