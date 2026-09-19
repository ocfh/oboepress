import { cookies } from "next/headers";
import { fail, ok, readJson, handleError } from "@/lib/http";
import { registerSchema } from "@/lib/validation";
import { setSessionCookie } from "@/lib/auth";
import { getAdminSecurity } from "@/lib/services/security";
import { getMemberSettings, registerMember } from "@/lib/services/members";
import { hasAnyUser } from "@/lib/services/users";
import { CAPTCHA_COOKIE, verifyCaptchaFor } from "@/lib/services/captcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 前台自助注册。注册关闭（或系统尚未初始化）时一律 404，与“接口不存在”
 * 表现一致，避免接口本身成为开关探测预言机。注册成功即写会话 cookie。
 */
export async function POST(req: Request) {
  const body = await readJson(req, registerSchema);
  if ("res" in body) return body.res;
  try {
    // 首跑向导未完成前禁止注册：否则首个账号会是订阅者，系统将再无管理员。
    if (!(await hasAnyUser())) return fail("接口不存在", 404);

    const [member, sec] = await Promise.all([
      getMemberSettings(),
      getAdminSecurity(),
    ]);
    if (!member.registerEnabled) return fail("接口不存在", 404);

    // 验证码先于注册信息校验（通道复用后台安全配置，开关取会员配置）。
    const captchaError = await verifyCaptchaFor(
      sec,
      member.captchaEnabled,
      body.data.captcha,
      cookies().get(CAPTCHA_COOKIE)?.value,
    );
    if (captchaError) return fail(captchaError, 400);

    const user = await registerMember({
      name: body.data.name,
      email: body.data.email,
      phone: body.data.phone,
      password: body.data.password,
      emailCode: body.data.emailCode,
      phoneCode: body.data.phoneCode,
      inviteCode: body.data.inviteCode,
    });
    await setSessionCookie(user);
    return ok({ user });
  } catch (e) {
    return handleError(e);
  }
}
