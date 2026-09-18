import { z } from "zod";
import { authenticate, authorize, fail, handleError, ok, readJson } from "@/lib/http";
import { getNotifySettings, sendTestMessage } from "@/lib/services/notify";
import { normalizeContactTarget } from "@/lib/services/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 后台「发送测试」：使用已保存的通道配置投递一封测试邮件 / 一条测试短信，
 * 便于管理员保存配置后立即验证 SMTP 或短信网关是否可用。
 */
const testSchema = z.object({
  channel: z.enum(["email", "sms"]),
  target: z.string().trim().min(3).max(160),
});

export async function POST(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;

    const body = await readJson(req, testSchema);
    if ("res" in body) return body.res;

    const settings = await getNotifySettings();
    const enabled =
      body.data.channel === "email" ? settings.email.enabled : settings.sms.enabled;
    if (!enabled) return fail("该通道尚未开启，请先开启并保存", 400);

    const target = normalizeContactTarget(body.data.channel, body.data.target);
    await sendTestMessage(body.data.channel, target);
    return ok({ sent: true });
  } catch (e) {
    return handleError(e);
  }
}
