import { cookies } from "next/headers";
import { fail, ok, readJson, handleError } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { verifyCredentials, setSessionCookie } from "@/lib/auth";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { CAPTCHA_COOKIE, verifyLoginCaptcha } from "@/lib/services/captcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req, loginSchema);
  if ("res" in body) return body.res;
  try {
    const sec = await getAdminSecurity();
    // 伪装入口开启时，登录接口只接受从秘密入口页发起的表单提交。浏览器默认
    // referrer 策略（strict-origin-when-cross-origin）在同源请求中会带上
    // 完整路径，脚本直连 /api/auth/login 一律得到 404，与“接口不存在”一致。
    if (!isEntryReferer(req, sec)) return fail("接口不存在", 404);

    // 验证码先于账号密码校验：未过验证码不暴露“邮箱/密码是否正确”。
    const captchaError = await verifyLoginCaptcha(
      sec,
      body.data.captcha,
      cookies().get(CAPTCHA_COOKIE)?.value,
    );
    if (captchaError) return fail(captchaError, 400);

    const user = await verifyCredentials(body.data.account, body.data.password);
    if (!user) return fail("账号或密码错误", 401);
    await setSessionCookie(user);
    return ok({ user });
  } catch (e) {
    return handleError(e);
  }
}
