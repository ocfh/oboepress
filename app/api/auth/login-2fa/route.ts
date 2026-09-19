import { fail, ok, readJson, handleError } from "@/lib/http";
import { loginTwoFaSchema } from "@/lib/validation";
import { setSessionCookie, verifyChallengeTicket } from "@/lib/auth";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { ensurePluginsLoaded } from "@/lib/services/plugins";
import { applyAsyncFilters, doAction, HOOKS } from "@/lib/hooks";
import {
  clientIp,
  clientUa,
  recordSecurityEvent,
  SECURITY_EVENTS,
} from "@/lib/services/security-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登录第二步：校验 /api/auth/login 下发的 10 分钟挑战票据 + 二步验证码
 * （TOTP 动态码或一次性恢复码，由启用的二步验证插件裁决）。
 */
export async function POST(req: Request) {
  const body = await readJson(req, loginTwoFaSchema);
  if ("res" in body) return body.res;
  try {
    const sec = await getAdminSecurity();
    if (!isEntryReferer(req, sec)) return fail("接口不存在", 404);

    const user = await verifyChallengeTicket(body.data.ticket);
    if (!user) return fail("验证已过期，请重新登录", 401);

    await ensurePluginsLoaded();
    const verdict = await applyAsyncFilters<{
      user: typeof user;
      code: string;
      ok: boolean;
    }>(HOOKS.authChallengeVerify, { user, code: body.data.code, ok: false });
    if (!verdict.ok) {
      await recordSecurityEvent({
        eventType: SECURITY_EVENTS.LOGIN_FAIL,
        userId: user.id,
        account: user.name,
        ip: clientIp(req),
        userAgent: clientUa(req),
        detail: { stage: "two-factor" },
      });
      return fail("动态码或恢复码不正确", 401);
    }

    await setSessionCookie(user);
    await recordSecurityEvent({
      eventType: SECURITY_EVENTS.LOGIN_SUCCESS,
      userId: user.id,
      account: user.name,
      ip: clientIp(req),
      userAgent: clientUa(req),
    });
    doAction(HOOKS.userLoggedIn, { user });
    return ok({ user });
  } catch (e) {
    return handleError(e);
  }
}
