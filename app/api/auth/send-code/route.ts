import { fail, ok, readJson, handleError } from "@/lib/http";
import { sendCodeSchema } from "@/lib/validation";
import { getMemberSettings, normalizeContactTarget } from "@/lib/services/members";
import { getNotifySettings, sendVerificationCode } from "@/lib/services/notify";
import { hasAnyUser } from "@/lib/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 公开「发送邮箱 / 手机验证码」接口（当前仅服务于前台注册场景）。
 *
 * 门控与注册接口保持一致：系统未初始化、注册关闭、对应通知通道未开启或
 * 未启用注册校验时一律 404，不暴露任何配置存在性。
 *
 * 防滥用依赖验证码服务自身的频控：同目标 60 秒一条、同 IP 每小时 20 条。
 * 这里刻意不复用图形验证码——它的答案单次有效，若发码时消费，用户提交
 * 注册时就得再解一次；图形码在最终注册提交时统一校验即可挡住批量注册。
 */
export async function POST(req: Request) {
  const body = await readJson(req, sendCodeSchema);
  if ("res" in body) return body.res;
  try {
    if (!(await hasAnyUser())) return fail("接口不存在", 404);

    const member = await getMemberSettings();
    if (!member.registerEnabled) return fail("接口不存在", 404);

    const notify = await getNotifySettings();
    const channelReady =
      body.data.channel === "email"
        ? notify.email.enabled && notify.register.emailVerify
        : notify.sms.enabled && notify.register.phoneVerify;
    if (!channelReady) return fail("接口不存在", 404);

    const target = normalizeContactTarget(body.data.channel, body.data.target);

    const fwd = req.headers.get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null;

    const result = await sendVerificationCode({
      channel: body.data.channel,
      target,
      purpose: "register",
      ip,
    });
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
