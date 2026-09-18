import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getNotifySettings, saveNotifySettings } from "@/lib/services/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 通知与验证码设置（SMTP / 邮件 Webhook / 短信 Webhook / 注册校验开关）。
 * SMTP 密码绝不回传前台；保存时省略 pass 字段表示保持原密码不变。
 */

const webhookSchema = z.object({
  url: z.string().max(500).optional(),
  method: z.enum(["POST", "GET", "PUT"]).optional(),
  headers: z.string().max(4000).optional(),
  body: z.string().max(4000).optional(),
});

const notifySchema = z.object({
  smtp: z
    .object({
      host: z.string().max(200).optional(),
      port: z.coerce.number().int().min(1).max(65535).optional(),
      security: z.enum(["TLS", "STARTTLS", "NONE"]).optional(),
      user: z.string().max(200).optional(),
      pass: z.string().max(300).optional(),
      from: z.string().max(200).optional(),
    })
    .optional(),
  email: z
    .object({
      enabled: z.boolean().optional(),
      via: z.enum(["smtp", "webhook"]).optional(),
      webhook: webhookSchema.optional(),
    })
    .optional(),
  sms: z
    .object({
      enabled: z.boolean().optional(),
      signature: z.string().max(40).optional(),
      webhook: webhookSchema.optional(),
    })
    .optional(),
  register: z
    .object({
      emailVerify: z.boolean().optional(),
      phoneVerify: z.boolean().optional(),
    })
    .optional(),
});

/** 抹掉敏感字段后再下发。 */
function masked<T extends { smtp: { pass: string } }>(s: T) {
  return { ...s, smtp: { ...s.smtp, pass: "" } };
}

export async function GET() {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    return ok(masked(await getNotifySettings()));
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    const body = await readJson(req, notifySchema);
    if ("res" in body) return body.res;
    const saved = await saveNotifySettings(body.data);
    return ok(masked(saved));
  } catch (e) {
    return handleError(e);
  }
}
