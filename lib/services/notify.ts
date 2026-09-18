import "server-only";
import { cache } from "react";
import { db, ensureMigrations } from "@/db";
import { verifyCodes } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getOption, setOption } from "./options";
import { getSettings } from "./settings";
import {
  issueCode,
  invalidateLatestCode,
  type CodeChannel,
  type CodePurpose,
} from "./verify-codes";
import { sendSmtpMail, type SmtpSecurity } from "./smtp";
import { ValidationError } from "./errors";

/**
 * 通知与验证码服务：
 * - 邮件：内置 SMTP（零依赖客户端，支持 465/587/25）或自定义 HTTP Webhook；
 * - 短信：仅走自定义 HTTP Webhook（各家短信网关签名差异大，统一模板化），
 *   URL / 请求体支持 {{target}} {{code}} {{sign}} 占位符；
 * - 注册场景是否强制邮箱/手机验证码由 register.emailVerify/phoneVerify 决定，
 *   会员注册服务在写库前消费验证码。
 * 配置存 options KV（key=notifySettings），免表迁移。
 */

const OPTION_KEY = "notifySettings";

export interface WebhookCfg {
  url: string;
  method: "POST" | "GET" | "PUT";
  /** 原样作为请求头（一行一个 Key: Value，或 JSON 对象文本）。 */
  headers: string;
  /** 请求体模板（GET 时忽略），支持 {{target}} {{code}} {{sign}}。 */
  body: string;
}

export interface NotifySettings {
  smtp: {
    host: string;
    port: number;
    security: SmtpSecurity;
    user: string;
    pass: string;
    from: string;
  };
  email: {
    enabled: boolean;
    via: "smtp" | "webhook";
    webhook: WebhookCfg;
  };
  sms: {
    enabled: boolean;
    /** 短信签名，如【OboePress】，供 Webhook 模板 {{sign}} 使用。 */
    signature: string;
    webhook: WebhookCfg;
  };
  register: {
    emailVerify: boolean;
    phoneVerify: boolean;
  };
}

const DEFAULT_WEBHOOK: WebhookCfg = {
  url: "",
  method: "POST",
  headers: "Content-Type: application/json",
  body: '{"target":"{{target}}","code":"{{code}}"}',
};

const DEFAULT_SETTINGS: NotifySettings = {
  smtp: { host: "", port: 465, security: "TLS", user: "", pass: "", from: "" },
  email: { enabled: false, via: "smtp", webhook: { ...DEFAULT_WEBHOOK } },
  sms: { enabled: false, signature: "OboePress", webhook: { ...DEFAULT_WEBHOOK } },
  register: { emailVerify: false, phoneVerify: false },
};

function mergeWebhook(cur: WebhookCfg, raw: Partial<WebhookCfg> | undefined): WebhookCfg {
  if (!raw) return cur;
  return {
    url: typeof raw.url === "string" ? raw.url : cur.url,
    method:
      raw.method === "POST" || raw.method === "GET" || raw.method === "PUT"
        ? raw.method
        : cur.method,
    headers: typeof raw.headers === "string" ? raw.headers : cur.headers,
    body: typeof raw.body === "string" ? raw.body : cur.body,
  };
}

export const getNotifySettings = cache(async (): Promise<NotifySettings> => {
  const stored = (await getOption<Partial<NotifySettings>>(OPTION_KEY, {})) ?? {};
  return {
    smtp: { ...DEFAULT_SETTINGS.smtp, ...(stored.smtp ?? {}) },
    email: {
      ...DEFAULT_SETTINGS.email,
      ...(stored.email ?? {}),
      webhook: mergeWebhook(
        { ...DEFAULT_WEBHOOK },
        stored.email?.webhook,
      ),
    },
    sms: {
      ...DEFAULT_SETTINGS.sms,
      ...(stored.sms ?? {}),
      webhook: mergeWebhook({ ...DEFAULT_WEBHOOK }, stored.sms?.webhook),
    },
    register: { ...DEFAULT_SETTINGS.register, ...(stored.register ?? {}) },
  };
});

export async function saveNotifySettings(
  input: Partial<NotifySettings>,
): Promise<NotifySettings> {
  const cur = await getNotifySettings();
  const next: NotifySettings = {
    smtp: {
      host: String(input.smtp?.host ?? cur.smtp.host).trim(),
      port: Number(input.smtp?.port ?? cur.smtp.port) || 465,
      security:
        input.smtp?.security === "TLS" ||
        input.smtp?.security === "STARTTLS" ||
        input.smtp?.security === "NONE"
          ? input.smtp.security
          : cur.smtp.security,
      user: String(input.smtp?.user ?? cur.smtp.user).trim(),
      // 密码允许空串清空；undefined 时保留原值。
      pass: input.smtp && "pass" in input.smtp ? String(input.smtp.pass ?? "") : cur.smtp.pass,
      from: String(input.smtp?.from ?? cur.smtp.from).trim(),
    },
    email: {
      enabled: !!input.email?.enabled,
      via: input.email?.via === "webhook" ? "webhook" : "smtp",
      webhook: mergeWebhook(cur.email.webhook, input.email?.webhook),
    },
    sms: {
      enabled: !!input.sms?.enabled,
      signature: String(input.sms?.signature ?? cur.sms.signature).trim(),
      webhook: mergeWebhook(cur.sms.webhook, input.sms?.webhook),
    },
    register: {
      emailVerify: !!input.register?.emailVerify,
      phoneVerify: !!input.register?.phoneVerify,
    },
  };
  await setOption(OPTION_KEY, next);
  return next;
}

/** 模板占位符替换；取值时做 JSON 转义之外保持原样（目标均为受控配置）。 */
function renderTpl(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = raw.trim();
  if (!text) return out;
  if (text.startsWith("{")) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j)) out[k] = String(v);
      return out;
    } catch {
      throw new ValidationError("请求头 JSON 格式不正确");
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

async function invokeWebhook(cfg: WebhookCfg, vars: Record<string, string>): Promise<void> {
  if (!cfg.url || !/^https?:\/\//i.test(cfg.url)) {
    throw new ValidationError("Webhook 地址未正确配置（需 http/https 开头）");
  }
  const url = renderTpl(cfg.url, vars);
  const method = cfg.method;
  const headers = parseHeaders(cfg.headers);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : renderTpl(cfg.body, vars),
      signal: ctrl.signal,
      cache: "no-store",
    });
    // 2xx 视为投递成功；网关错误信息不向前台透传（防内网细节泄露）。
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError("验证码通道暂不可用，请稍后再试");
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

async function deliverViaEmail(to: string, subject: string, text: string, html: string) {
  const s = await getNotifySettings();
  if (!s.email.enabled) throw new ValidationError("邮件通道未开启");
  if (s.email.via === "webhook") {
    // 邮件 Webhook 只拿到目标地址，正文类网关通常自行套模板。
    await invokeWebhook(s.email.webhook, { target: to, code: "", sign: s.sms.signature, purpose: "" });
    return;
  }
  if (!s.smtp.host) throw new ValidationError("SMTP 未配置");
  await sendSmtpMail(
    {
      host: s.smtp.host,
      port: s.smtp.port,
      security: s.smtp.security,
      user: s.smtp.user,
      pass: s.smtp.pass,
      from: s.smtp.from || s.smtp.user,
    },
    { to, subject, text, html },
  );
}

async function deliverViaSms(to: string, code: string) {
  const s = await getNotifySettings();
  if (!s.sms.enabled) throw new ValidationError("短信通道未开启");
  await invokeWebhook(s.sms.webhook, {
    target: to,
    code,
    sign: s.sms.signature,
    purpose: "",
  });
}

const PURPOSE_LABEL: Record<CodePurpose, string> = {
  register: "注册",
  reset: "找回密码",
  bind: "绑定",
  login: "登录",
};

/**
 * 签发并投递验证码。投递失败时回滚在途码（允许用户立刻重试），
 * 成功返回基础频控参数供前端倒计时。
 */
export async function sendVerificationCode(input: {
  channel: CodeChannel;
  target: string;
  purpose: CodePurpose;
  ip?: string | null;
}): Promise<{ resendAfter: number }> {
  await ensureMigrations();
  const code = await issueCode(input);
  try {
    const settings = await getSettings();
    const siteName = settings.title || "OboePress";
    const label = PURPOSE_LABEL[input.purpose];
    if (input.channel === "email") {
      const subject = `【${siteName}】${label}验证码 ${code}`;
      const text = `您正在进行${label}操作，验证码：${code}，10 分钟内有效，请勿泄露给他人。`;
      const html =
        `<div style="padding:24px;font-family:system-ui,sans-serif">` +
        `<h2 style="margin:0 0 12px">${escapeHtml(siteName)}</h2>` +
        `<p>您正在进行${label}操作，验证码为：</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>` +
        `<p style="color:#888;font-size:12px">10 分钟内有效，请勿泄露给他人。如非本人操作请忽略此邮件。</p>` +
        `</div>`;
      await deliverViaEmail(input.target, subject, text, html);
    } else {
      await deliverViaSms(input.target, code);
    }
    return { resendAfter: 60 };
  } catch (e) {
    await invalidateLatestCode(input);
    throw e;
  }
}

/** 后台「发送测试」用：邮件投递固定测试内容；短信发送一条 888888 风格测试码。 */
export async function sendTestMessage(channel: CodeChannel, target: string): Promise<void> {
  if (channel === "email") {
    await deliverViaEmail(
      target,
      "OboePress 通知通道测试",
      "这是一封来自 OboePress 的测试邮件，收到即表示 SMTP / Webhook 配置可用。",
      "<p>这是一封来自 <b>OboePress</b> 的测试邮件，收到即表示通知通道配置可用。</p>",
    );
  } else {
    const s = await getNotifySettings();
    await invokeWebhook(s.sms.webhook, { target, code: "888888", sign: s.sms.signature, purpose: "test" });
  }
}

/** 仅供调试/后台查看：最近一条在途验证码（后台自测发送链路时用）。 */
export async function peekLatestLiveCode(
  channel: CodeChannel,
  target: string,
  purpose: CodePurpose,
): Promise<{ createdAt: Date; expiresAt: Date } | null> {
  const [row] = await db
    .select({ createdAt: verifyCodes.createdAt, expiresAt: verifyCodes.expiresAt })
    .from(verifyCodes)
    .where(
      and(
        eq(verifyCodes.target, target),
        eq(verifyCodes.channel, channel),
        eq(verifyCodes.purpose, purpose),
        isNull(verifyCodes.consumedAt),
      ),
    )
    .orderBy(desc(verifyCodes.id))
    .limit(1);
  return row ?? null;
}
