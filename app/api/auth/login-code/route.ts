import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { fail, ok, readJson, handleError } from "@/lib/http";
import { loginCodeSchema } from "@/lib/validation";
import { signChallengeTicket, setSessionCookie } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { CAPTCHA_COOKIE, verifyLoginCaptcha } from "@/lib/services/captcha";
import { normalizeContactTarget } from "@/lib/services/members";
import { verifyCode } from "@/lib/services/verify-codes";
import { findUserByContact } from "@/lib/services/users";
import { ensurePluginsLoaded } from "@/lib/services/plugins";
import { applyAsyncFilters, doAction, HOOKS } from "@/lib/hooks";
import {
  assertLoginAllowed,
  clientIp,
  clientUa,
  recordSecurityEvent,
  SECURITY_EVENTS,
} from "@/lib/services/security-events";
import type { SessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Challenge = { type: string } | null;

/**
 * 邮箱 / 手机验证码免密登录。
 *
 * 与密码登录（/api/auth/login）走完全相同的安全链：伪装入口 Referer 校验 →
 * 图形验证码 → 失败限流 → 二步验证插件挑战票据 → 写会话 → 安全事件/登录钩子，
 * 差别仅在「凭据」由一次性验证码（verify-codes，purpose=login）承担。
 * 验证码本身有 5 次错误上限与 10 分钟有效期，消费成功即作废。
 */
export async function POST(req: Request) {
  const body = await readJson(req, loginCodeSchema);
  if ("res" in body) return body.res;
  try {
    const sec = await getAdminSecurity();
    if (!isEntryReferer(req, sec)) return fail("接口不存在", 404);

    const captchaError = await verifyLoginCaptcha(
      sec,
      body.data.captcha,
      cookies().get(CAPTCHA_COOKIE)?.value,
    );
    if (captchaError) return fail(captchaError, 400);

    const ip = clientIp(req);
    const ua = clientUa(req);
    const { channel } = body.data;
    // 归一化失败抛 ValidationError（422 + 中文提示），在进入频控计数前拦截。
    const target = normalizeContactTarget(channel, body.data.target);
    const account = channel === "email" ? target : `手机:${target}`;

    try {
      await assertLoginAllowed(account, ip);
    } catch (e) {
      await recordSecurityEvent({
        eventType: SECURITY_EVENTS.LOGIN_LOCKED,
        account,
        ip,
        userAgent: ua,
      });
      throw e;
    }

    // 验证码错误：与密码错误同样记安全事件并走失败计数。
    try {
      await verifyCode({
        channel,
        target,
        purpose: "login",
        code: body.data.code,
      });
    } catch {
      await recordSecurityEvent({
        eventType: SECURITY_EVENTS.LOGIN_FAIL,
        account,
        ip,
        userAgent: ua,
      });
      return fail("验证码不正确或已过期", 401);
    }

    const row = await findUserByContact(channel, target);
    if (!row || row.status !== "active") {
      // 理论上发码环节只给存在的活跃账号发码，走到这里属异常，按登录失败处理。
      await recordSecurityEvent({
        eventType: SECURITY_EVENTS.LOGIN_FAIL,
        account,
        ip,
        userAgent: ua,
      });
      return fail("验证码不正确或已过期", 401);
    }

    const user: SessionUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    };

    // 二步验证插件拦截：票据链与密码登录共用 /api/auth/login-2fa。
    await ensurePluginsLoaded();
    const challenged = await applyAsyncFilters<{
      user: SessionUser;
      challenge: Challenge;
    }>(HOOKS.authChallenge, { user, challenge: null });
    if (challenged.challenge) {
      const ticket = await signChallengeTicket(user);
      return ok({
        twoFactorRequired: true,
        challengeType: challenged.challenge.type,
        ticket,
      });
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
    await setSessionCookie(user);
    await recordSecurityEvent({
      eventType: SECURITY_EVENTS.LOGIN_SUCCESS,
      userId: user.id,
      account,
      ip,
      userAgent: ua,
    });
    doAction(HOOKS.userLoggedIn, { user });
    return ok({ user });
  } catch (e) {
    return handleError(e);
  }
}
