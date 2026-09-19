import { cookies } from "next/headers";
import { ok, fail, readJson, handleError } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { CAPTCHA_COOKIE, verifyLoginCaptcha } from "@/lib/services/captcha";
import { findUserByAccount } from "@/lib/services/users";
import { sendVerificationCode } from "@/lib/services/notify";
import {
  clientIp,
  clientUa,
  recordSecurityEvent,
  SECURITY_EVENTS,
} from "@/lib/services/security-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 找回密码第一步：校验图形验证码后，向账号绑定邮箱发送 6 位重置码（10 分钟
 * 有效，复用通用验证码服务的 reset 用途）。与登录接口同款伪装入口 referer
 * 校验，脚本直连一律 404。
 */
export async function POST(req: Request) {
  const body = await readJson(req, forgotPasswordSchema);
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
    const account = body.data.account;
    const user = await findUserByAccount(account);
    if (user?.email) {
      await sendVerificationCode({
        channel: "email",
        target: user.email,
        purpose: "reset",
        ip,
      });
      await recordSecurityEvent({
        eventType: SECURITY_EVENTS.RESET_REQUEST,
        userId: user.id,
        account,
        ip,
        userAgent: clientUa(req),
      });
    }
    // 账号不存在或未绑定邮箱也返回同样结果，避免接口被用来枚举账号。
    return ok({ sent: true });
  } catch (e) {
    return handleError(e);
  }
}
