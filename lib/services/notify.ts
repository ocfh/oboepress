import "server-only";
import { cache } from "react";
import { createHash, createHmac, randomUUID } from "node:crypto";
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
 * - 短信：三种通道——阿里云短信（POP RPC HMAC-SHA1 签名）、腾讯云短信
 *   （TC3-HMAC-SHA256 签名）或自定义 HTTP Webhook（URL/体支持
 *   {{target}} {{code}} {{sign}} 占位符）；两家签名均用 node:crypto 零依赖实现；
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

export type SmsProvider = "webhook" | "aliyun" | "tencent";

export interface AliyunSmsCfg {
  accessKeyId: string;
  /** 敏感字段：GET 掩码、保存时 undefined 保留原值、空串显式清空。 */
  accessKeySecret: string;
  /** 短信签名名称（阿里云控制台已审核签名，不带【】）。 */
  signName: string;
  /** 模板 CODE，如 SMS_123456789。 */
  templateCode: string;
  /** 模板变量名，默认 code（TemplateParam 为 {"code":"1234"}）。 */
  codeParam: string;
  /** 接入点根地址，留空走 https://dysmsapi.aliyuncs.com；国际站/私有化可改。 */
  endpoint: string;
}

export interface TencentSmsCfg {
  secretId: string;
  /** 敏感字段，掩码规则同阿里云密钥。 */
  secretKey: string;
  /** SmsSdkAppId（短信应用 ID）。 */
  sdkAppId: string;
  signName: string;
  /** 模板 ID，纯数字字符串。 */
  templateId: string;
  /** 地域，默认 ap-guangzhou，决定接入域名 sms.{region}.tencentcloudapi.com。 */
  region: string;
  /** 高级：自定义接入根地址（留空按地域推导）。 */
  endpoint: string;
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
    /** 投递提供方：自定义 Webhook / 阿里云 / 腾讯云。 */
    provider: SmsProvider;
    /** 短信签名原文，供 Webhook 模板 {{sign}} 使用。 */
    signature: string;
    webhook: WebhookCfg;
    aliyun: AliyunSmsCfg;
    tencent: TencentSmsCfg;
  };
  register: {
    emailVerify: boolean;
    phoneVerify: boolean;
  };
  /** 登录验证码通道开关（邮箱/手机验证码免密登录）。 */
  login: {
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

const DEFAULT_ALIYUN: AliyunSmsCfg = {
  accessKeyId: "",
  accessKeySecret: "",
  signName: "",
  templateCode: "",
  codeParam: "code",
  endpoint: "",
};

const DEFAULT_TENCENT: TencentSmsCfg = {
  secretId: "",
  secretKey: "",
  sdkAppId: "",
  signName: "",
  templateId: "",
  region: "ap-guangzhou",
  endpoint: "",
};

const DEFAULT_SETTINGS: NotifySettings = {
  smtp: { host: "", port: 465, security: "TLS", user: "", pass: "", from: "" },
  email: { enabled: false, via: "smtp", webhook: { ...DEFAULT_WEBHOOK } },
  sms: {
    enabled: false,
    provider: "webhook",
    signature: "OboePress",
    webhook: { ...DEFAULT_WEBHOOK },
    aliyun: { ...DEFAULT_ALIYUN },
    tencent: { ...DEFAULT_TENCENT },
  },
  register: { emailVerify: false, phoneVerify: false },
  login: { emailVerify: false, phoneVerify: false },
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
      aliyun: { ...DEFAULT_ALIYUN, ...(stored.sms?.aliyun ?? {}) },
      tencent: { ...DEFAULT_TENCENT, ...(stored.sms?.tencent ?? {}) },
    },
    register: { ...DEFAULT_SETTINGS.register, ...(stored.register ?? {}) },
    login: { ...DEFAULT_SETTINGS.login, ...(stored.login ?? {}) },
  };
});

/** 嵌套对象也全部可选（zod partial 校验后的入参形态）。 */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export async function saveNotifySettings(
  input: DeepPartial<NotifySettings>,
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
    sms: (() => {
      const raw = input.sms ?? {};
      const provider: SmsProvider =
        raw.provider === "aliyun" || raw.provider === "tencent" || raw.provider === "webhook"
          ? raw.provider
          : cur.sms.provider;
      // 敏感密钥：undefined（掩码表单未重填）保留原值；空串显式清空。
      const keepSecret = (oldVal: string, v: unknown) =>
        typeof v === "undefined" ? oldVal : String(v);
      const text = (oldVal: string, v: unknown, max = 200) =>
        typeof v === "string" ? v.trim().slice(0, max) : oldVal;
      const nextSms: NotifySettings["sms"] = {
        enabled: !!raw.enabled,
        provider,
        signature: text(cur.sms.signature, raw.signature, 40),
        webhook: mergeWebhook(cur.sms.webhook, raw.webhook),
        aliyun: {
          accessKeyId: text(cur.sms.aliyun.accessKeyId, raw.aliyun?.accessKeyId),
          accessKeySecret: keepSecret(cur.sms.aliyun.accessKeySecret, raw.aliyun?.accessKeySecret),
          signName: text(cur.sms.aliyun.signName, raw.aliyun?.signName, 100),
          templateCode: text(cur.sms.aliyun.templateCode, raw.aliyun?.templateCode, 100),
          codeParam: text(cur.sms.aliyun.codeParam || "code", raw.aliyun?.codeParam, 40) || "code",
          endpoint: text(cur.sms.aliyun.endpoint, raw.aliyun?.endpoint, 300),
        },
        tencent: {
          secretId: text(cur.sms.tencent.secretId, raw.tencent?.secretId),
          secretKey: keepSecret(cur.sms.tencent.secretKey, raw.tencent?.secretKey),
          sdkAppId: text(cur.sms.tencent.sdkAppId, raw.tencent?.sdkAppId, 64),
          signName: text(cur.sms.tencent.signName, raw.tencent?.signName, 100),
          templateId: text(cur.sms.tencent.templateId, raw.tencent?.templateId, 64),
          region: text(cur.sms.tencent.region || "ap-guangzhou", raw.tencent?.region, 64) || "ap-guangzhou",
          endpoint: text(cur.sms.tencent.endpoint, raw.tencent?.endpoint, 300),
        },
      };
      // 仅在启用时校验所选通道必填项；自定义 endpoint 必须是 http(s) 根地址。
      if (nextSms.enabled) {
        const endpointOk = (u: string) => {
          if (!u) return;
          let parsed: URL;
          try {
            parsed = new URL(u);
          } catch {
            throw new ValidationError("短信接入点地址不是合法 URL");
          }
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new ValidationError("短信接入点地址仅支持 http/https");
          }
        };
        if (provider === "aliyun") {
          const a = nextSms.aliyun;
          if (!a.accessKeyId || !a.accessKeySecret || !a.signName || !a.templateCode) {
            throw new ValidationError("阿里云短信缺少 AccessKey、签名或模板等必填配置");
          }
          endpointOk(a.endpoint);
        } else if (provider === "tencent") {
          const t = nextSms.tencent;
          if (!t.secretId || !t.secretKey || !t.sdkAppId || !t.signName || !t.templateId) {
            throw new ValidationError("腾讯云短信缺少 SecretId、SdkAppId、签名或模板等必填配置");
          }
          endpointOk(t.endpoint);
        }
      }
      return nextSms;
    })(),
    register: {
      emailVerify: !!input.register?.emailVerify,
      phoneVerify: !!input.register?.phoneVerify,
    },
    login: {
      emailVerify: !!input.login?.emailVerify,
      phoneVerify: !!input.login?.phoneVerify,
    },
  };
  await setOption(OPTION_KEY, next);
  return next;
}

/**
 * 模板占位符替换；取值时做 JSON 转义之外保持原样（目标均为受控配置）。
 * 同时供自定义验证码校验请求（captcha.ts）复用，避免两份模板实现漂移。
 */
export function renderTpl(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

/** 请求头原文解析：JSON 对象（{ 开头）或每行 `Key: Value`；JSON 损坏抛 422。 */
export function parseHeaders(raw: string): Record<string, string> {
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

// --- 预置短信服务商（零依赖，node:crypto 签名） ---

const ALIYUN_SMS_ENDPOINT = "https://dysmsapi.aliyuncs.com";
const TENCENT_SMS_VERSION = "2021-01-11";

/** 带超时的 fetch，网络/超时统一由调用方包成中文业务错误。 */
function timeoutFetch(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" }).finally(() =>
    clearTimeout(timer),
  );
}

/** POP 签名专用百分号编码：encodeURIComponent 后修正 + * ~ 三字符。 */
function pctEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

/** 手机号归一化：大陆 11 位自动补 +86；已带 + 或其他原文透传。 */
function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s-]/g, "");
  if (s.startsWith("+")) return s;
  if (/^1\d{10}$/.test(s)) return `+86${s}`;
  return /^\d+$/.test(s) ? `+${s}` : s;
}

/**
 * 阿里云短信 SendSms（POP RPC 风格签名）：
 * 公共参数 + 业务参数按字典序拼规范查询串，HMAC-SHA1(key=Secret&) 后 Base64。
 * 参考：https://help.aliyun.com/document_detail/101342（RPC 签名机制）。
 */
async function sendViaAliyunSms(cfg: AliyunSmsCfg, phone: string, code: string): Promise<void> {
  const params: Record<string, string> = {
    Action: "SendSms",
    Version: "2017-05-25",
    Format: "JSON",
    RegionId: "cn-hangzhou",
    AccessKeyId: cfg.accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    PhoneNumbers: phone,
    SignName: cfg.signName,
    TemplateCode: cfg.templateCode,
    TemplateParam: JSON.stringify({ [cfg.codeParam || "code"]: code }),
  };
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join("&");
  const stringToSign = `GET&${pctEncode("/")}&${pctEncode(canonical)}`;
  const signature = createHmac("sha1", `${cfg.accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");
  const base = (cfg.endpoint || ALIYUN_SMS_ENDPOINT).replace(/\/+$/, "");
  const url = `${base}/?${canonical}&Signature=${pctEncode(signature)}`;
  let res: Response;
  try {
    res = await timeoutFetch(url, { method: "GET" });
  } catch {
    throw new ValidationError("短信服务暂不可用，请稍后再试");
  }
  let j: { Code?: string; Message?: string } | null = null;
  try {
    j = (await res.json()) as { Code?: string; Message?: string };
  } catch {
    throw new ValidationError("短信服务响应解析失败");
  }
  // 成功响应为 {"Message":"OK","RequestId":"...","Code":"OK","BizId":"..."}。
  // 仅把业务码透传给后台（isv.BUSINESS_LIMIT_CONTROL 等），不回传含手机号的 Message。
  if (!res.ok || j.Code !== "OK") {
    throw new ValidationError(`短信发送失败${j.Code ? `（${j.Code}）` : ""}`);
  }
}

/**
 * 腾讯云短信 SendSms（TC3-HMAC-SHA256 签名 v3）：
 * canonical request → stringToSign → 三级派生密钥签名，零依赖实现。
 * 参考：https://cloud.tencent.com/document/product/382/55981。
 */
async function sendViaTencentSms(cfg: TencentSmsCfg, phone: string, code: string): Promise<void> {
  const origin = (
    cfg.endpoint || `https://sms.${cfg.region || "ap-guangzhou"}.tencentcloudapi.com`
  ).replace(/\/+$/, "");
  const host = new URL(origin).host;
  const payload = JSON.stringify({
    PhoneNumberSet: [normalizePhone(phone)],
    SmsSdkAppId: cfg.sdkAppId,
    SignName: cfg.signName,
    TemplateId: cfg.templateId,
    // 验证码模板只有一个变量；多变量模板不适用验证码场景。
    TemplateParamSet: [code],
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sha256Hex = (data: string): string => createHash("sha256").update(data).digest("hex");
  const hmac = (key: Buffer | string, data: string): Buffer =>
    createHmac("sha256", key).update(data).digest();

  const canonical = [
    "POST",
    "/",
    "",
    "content-type:application/json; charset=utf-8",
    `host:${host}`,
    "x-tc-action:sendsms",
    "",
    "content-type;host;x-tc-action",
    sha256Hex(payload),
  ].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  const scope = `${date}/sms/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", timestamp, scope, sha256Hex(canonical)].join("\n");
  const secretSigning = hmac(hmac(hmac(`TC3${cfg.secretKey}`, date), "sms"), "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign).digest("hex");
  const authorization =
    `TC3-HMAC-SHA256 Credential=${cfg.secretId}/${scope}, ` +
    "SignedHeaders=content-type;host;x-tc-action, " +
    `Signature=${signature}`;

  let res: Response;
  try {
    res = await timeoutFetch(`${origin}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: authorization,
        "X-TC-Action": "SendSms",
        "X-TC-Version": TENCENT_SMS_VERSION,
        "X-TC-Timestamp": timestamp,
      },
      body: payload,
    });
  } catch {
    throw new ValidationError("短信服务暂不可用，请稍后再试");
  }
  type TencentSmsResult = {
    Response?: {
      Error?: { Code?: string };
      SendStatusSet?: { Code?: string; Message?: string }[];
    };
  };
  let j: TencentSmsResult | null = null;
  try {
    j = (await res.json()) as TencentSmsResult;
  } catch {
    throw new ValidationError("短信服务响应解析失败");
  }
  const st = j?.Response?.SendStatusSet?.[0];
  if (!res.ok || !st || st.Code !== "Ok") {
    const code0 = st?.Code || j?.Response?.Error?.Code || "";
    throw new ValidationError(`短信发送失败${code0 ? `（${code0}）` : ""}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

async function deliverViaEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
  vars: { code?: string; purpose?: string } = {},
) {
  const s = await getNotifySettings();
  if (!s.email.enabled) throw new ValidationError("邮件通道未开启");
  if (s.email.via === "webhook") {
    // 同时下发 code/purpose：正文类网关忽略即可，直发码类网关可直接拼模板。
    await invokeWebhook(s.email.webhook, {
      target: to,
      code: vars.code ?? "",
      sign: s.sms.signature,
      purpose: vars.purpose ?? "",
    });
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
  if (s.sms.provider === "aliyun") {
    await sendViaAliyunSms(s.sms.aliyun, to, code);
    return;
  }
  if (s.sms.provider === "tencent") {
    await sendViaTencentSms(s.sms.tencent, to, code);
    return;
  }
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
    const siteName = settings.siteTitle || "OboePress";
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
      await deliverViaEmail(input.target, subject, text, html, {
        code,
        purpose: input.purpose,
      });
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
      // 与短信测试一致：SMTP 分支忽略 vars；Webhook 分支拿到带固定码的真实模板载荷。
      { code: "888888", purpose: "test" },
    );
  } else {
    // 三种短信通道统一走投递入口，测试码 888888 仅用于验证链路。
    await deliverViaSms(target, "888888");
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
