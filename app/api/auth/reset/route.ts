import { ok, fail, readJson, handleError } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validation";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { findUserByAccount, resetUserPassword } from "@/lib/services/users";
import { verifyCode } from "@/lib/services/verify-codes";
import {
  clientIp,
  clientUa,
  recordSecurityEvent,
  SECURITY_EVENTS,
} from "@/lib/services/security-events";
import { ValidationError } from "@/lib/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 找回密码第二步：校验邮箱重置码（单次有效），通过后写入新密码。
 * 重置码本身即第二因素，故不再要求图形验证码；仍走伪装入口 referer 校验。
 */
export async function POST(req: Request) {
  const body = await readJson(req, resetPasswordSchema);
  if ("res" in body) return body.res;
  try {
    const sec = await getAdminSecurity();
    if (!isEntryReferer(req, sec)) return fail("接口不存在", 404);

    const account = body.data.account;
    const user = await findUserByAccount(account);
    if (!user?.email) {
      // 与发码接口口径一致，不暴露账号是否存在。
      throw new ValidationError("验证码错误或已过期");
    }

    // verifyCode 成功即消费该码，失败直接抛错透传。
    await verifyCode({
      channel: "email",
      target: user.email,
      purpose: "reset",
      code: body.data.code,
    });

    await resetUserPassword(user.id, body.data.password);
    await recordSecurityEvent({
      eventType: SECURITY_EVENTS.RESET_DONE,
      userId: user.id,
      account,
      ip: clientIp(req),
      userAgent: clientUa(req),
    });
    return ok({ reset: true });
  } catch (e) {
    return handleError(e);
  }
}
