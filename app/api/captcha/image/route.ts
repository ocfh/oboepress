import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { getMemberSettings, isRegisterReferer } from "@/lib/services/members";
import {
  CAPTCHA_COOKIE,
  captchaSvg,
  generateCaptchaCode,
  signCaptchaToken,
} from "@/lib/services/captcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 内置图形验证码：每次请求出新图 + 新的 10 分钟答案令牌 cookie。
 * 登录入口页与（开启注册验证码时的）注册页都可取图；custom 模式不出图。
 */
export async function GET(req: Request) {
  const [sec, member] = await Promise.all([
    getAdminSecurity(),
    getMemberSettings(),
  ]);
  if (!isEntryReferer(req, sec) && !isRegisterReferer(req, member)) {
    return fail("接口不存在", 404);
  }
  const builtinWanted =
    sec.captchaMode === "builtin" &&
    (sec.captchaEnabled ||
      (member.registerEnabled && member.captchaEnabled));
  // 关闭或自定义模式下不提供图形，避免接口本身暴露配置状态。
  if (!builtinWanted) {
    return fail("接口不存在", 404);
  }
  const code = generateCaptchaCode();
  const token = await signCaptchaToken(code);
  const res = new NextResponse(captchaSvg(code), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
  res.cookies.set(CAPTCHA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
