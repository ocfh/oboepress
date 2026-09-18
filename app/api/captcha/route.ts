import { ok, fail } from "@/lib/http";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { getMemberSettings, isRegisterReferer } from "@/lib/services/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登录页据此决定是否渲染验证码区；伪装开启时与登录接口同口径校验 Referer。
 * 注册页也可携带其注册路径 Referer 访问（开关/方式以 /api/members/config 为准）。
 */
export async function GET(req: Request) {
  const [sec, member] = await Promise.all([
    getAdminSecurity(),
    getMemberSettings(),
  ]);
  if (!isEntryReferer(req, sec) && !isRegisterReferer(req, member)) {
    return fail("接口不存在", 404);
  }
  return ok({
    enabled: sec.captchaEnabled,
    mode: sec.captchaEnabled ? sec.captchaMode : null,
  });
}
