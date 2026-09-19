import { ok, fail } from "@/lib/http";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登录页验证码配置探测：返回 { enabled, mode }。
 * 伪装后台入口开启时，非秘密入口页发起的请求一律 404（前端按「不显示验证码」
 * 处理，不暴露配置状态）。图形本体在 /api/captcha/image，评论验证码在
 * /api/comment-captcha，三者职责分离。
 */
export async function GET(req: Request) {
  const sec = await getAdminSecurity();
  if (!isEntryReferer(req, sec)) return fail("接口不存在", 404);
  return ok({
    enabled: sec.captchaEnabled,
    mode: sec.captchaEnabled ? sec.captchaMode : null,
  });
}
