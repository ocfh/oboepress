import { ok, fail } from "@/lib/http";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { getNotifySettings } from "@/lib/services/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登录页公开配置：当前可用的验证码登录通道（邮箱 / 手机）。
 * 伪装入口开启时与登录接口同口径校验 Referer，不暴露配置存在性。
 */
export async function GET(req: Request) {
  const [sec, notify] = await Promise.all([
    getAdminSecurity(),
    getNotifySettings(),
  ]);
  if (!isEntryReferer(req, sec)) return fail("接口不存在", 404);
  return ok({
    email: notify.email.enabled && notify.login.emailVerify,
    sms: notify.sms.enabled && notify.login.phoneVerify,
  });
}
