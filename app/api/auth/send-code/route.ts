import { fail, ok, readJson, handleError, authenticate } from "@/lib/http";
import { sendCodeSchema } from "@/lib/validation";
import { getMemberSettings, normalizeContactTarget } from "@/lib/services/members";
import { getNotifySettings, sendVerificationCode } from "@/lib/services/notify";
import { getAdminSecurity, isEntryReferer } from "@/lib/services/security";
import { findUserByContact, hasAnyUser } from "@/lib/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 公开「发送邮箱 / 手机验证码」接口，服务于两类场景：
 *
 * - purpose=register（缺省，兼容旧前端）：门控与注册接口一致——系统未初始化、
 *   注册关闭、通道未开启或未启用注册校验时一律 404。
 * - purpose=login：登录页的验证码免密登录。伪装入口开启时同样只接受秘密入口
 *   页作为 Referer；通道由「登录验证码策略」门控；目标账号不存在时仍返回
 *   成功但不真正发码，避免接口沦为账号存在性预言机。
 * - purpose=bind：账号中心（登录态）绑定/换绑邮箱或手机。只校验通知通道
 *   总开关；目标已被其他账号占用时直接 409（前端需要明确提示换号）。
 *
 * 防滥用依赖验证码服务自身的频控：同目标 60 秒一条、同 IP 每小时 20 条。
 */
export async function POST(req: Request) {
  const body = await readJson(req, sendCodeSchema);
  if ("res" in body) return body.res;
  try {
    if (!(await hasAnyUser())) return fail("接口不存在", 404);

    const { channel, target: rawTarget } = body.data;
    const purpose = body.data.purpose ?? "register";
    const notify = await getNotifySettings();

    if (purpose === "bind") {
      // 绑定/换绑仅限登录态；通道只看通知总开关（登录/注册开关与此无关）。
      const auth = await authenticate();
      if ("res" in auth) return auth.res;

      const channelReady =
        channel === "email" ? notify.email.enabled : notify.sms.enabled;
      if (!channelReady) return fail("接口不存在", 404);

      const target = normalizeContactTarget(channel, rawTarget);
      const owner = await findUserByContact(channel, target);
      if (owner && owner.id !== auth.user.id) {
        return fail(
          channel === "email" ? "该邮箱已被其他账号绑定" : "该手机号已被其他账号绑定",
          409,
        );
      }
      const result = await sendVerificationCode({
        channel,
        target,
        purpose: "bind",
        ip: clientIp(req),
      });
      return ok(result);
    }

    if (purpose === "login") {
      // 伪装入口：脚本直连与错误 Referer 一律 404。
      const sec = await getAdminSecurity();
      if (!isEntryReferer(req, sec)) return fail("接口不存在", 404);

      const channelReady =
        channel === "email"
          ? notify.email.enabled && notify.login.emailVerify
          : notify.sms.enabled && notify.login.phoneVerify;
      if (!channelReady) return fail("接口不存在", 404);

      const target = normalizeContactTarget(channel, rawTarget);

      // 防账号枚举：无此账号时静默成功（不发码），响应与真实发送不可区分。
      const user = await findUserByContact(channel, target);
      if (!user || user.status !== "active") return ok({ sent: true });

      const ip = clientIp(req);
      const result = await sendVerificationCode({ channel, target, purpose: "login", ip });
      return ok(result);
    }

    const member = await getMemberSettings();
    if (!member.registerEnabled) return fail("接口不存在", 404);

    const channelReady =
      channel === "email"
        ? notify.email.enabled && notify.register.emailVerify
        : notify.sms.enabled && notify.register.phoneVerify;
    if (!channelReady) return fail("接口不存在", 404);

    const target = normalizeContactTarget(channel, rawTarget);

    const fwd = req.headers.get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null;

    const result = await sendVerificationCode({
      channel,
      target,
      purpose: "register",
      ip,
    });
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null;
}
