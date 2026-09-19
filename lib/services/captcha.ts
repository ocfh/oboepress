/**
 * 登录 / 注册 / 找回密码的图形验证码服务。
 *
 * 两种模式（后台安全设置 captchaMode）：
 * - builtin：本地生成 4 位字符 SVG，答案封进 HMAC 签名的无状态令牌（httpOnly
 *   cookie 下发），验证通过即一次性消费（jti 记在进程内，带 TTL 清理）；
 * - custom：把用户输入转发到站方自定义校验接口（模板化 URL / 请求头 / 请求体），
 *   按 {ok:true} 或管理员配置的「路径=值」规则判定，用于对接第三方行为验证码。
 *
 * 登录开关取 sec.captchaEnabled；注册开关取会员设置 member.captchaEnabled，
 * 但通道（模式 / 自定义接口配置）一律复用后台安全配置。
 */
import crypto from "node:crypto";
import { getServerSecret } from "@/lib/auth";
import type { AdminSecurity } from "./security";

/** 答案令牌的 cookie 名；消费方统一从此常量取值。 */
export const CAPTCHA_COOKIE = "oboe_captcha";

const VERSION = "oboe.login-captcha.v1";
/** 令牌有效期 10 分钟，与 cookie maxAge 对齐。 */
const TTL_MS = 10 * 60 * 1000;
/** 已消费 jti 的容量上限，超出时淘汰最早到期的一批。 */
const USED_CAP = 5000;
/** custom 模式请求第三方接口的超时时间，避免外部故障拖死登录。 */
const REMOTE_TIMEOUT_MS = 8000;

/** 去除 0/O、1/I/L 等易混淆字符后的 32 个字符。 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

let keyCache: Buffer | null = null;
function signingKey(): Buffer {
  if (!keyCache) {
    keyCache = crypto
      .createHmac("sha256", getServerSecret())
      .update(VERSION)
      .digest();
  }
  return keyCache;
}

/** jti -> 到期时间戳；只记录「已正确消费」的令牌，用于防重放。 */
const used = new Map<string, number>();
let lastSweep = 0;

function sweepUsed(now: number) {
  if (now - lastSweep < 60_000 && used.size < USED_CAP) return;
  lastSweep = now;
  for (const [jti, exp] of used) {
    if (exp <= now) used.delete(jti);
  }
  if (used.size >= USED_CAP) {
    const sorted = [...used.entries()].sort((a, b) => a[1] - b[1]);
    for (const [jti] of sorted.slice(0, Math.ceil(USED_CAP / 10))) used.delete(jti);
  }
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(bodyB64: string): string {
  return crypto.createHmac("sha256", signingKey()).update(bodyB64).digest("base64url");
}

function timingSafeEqualText(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    const dummy = Buffer.alloc(ba.length);
    crypto.timingSafeEqual(ba, dummy);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/** 答案归一：去空白、全角转半角、转大写（字符集本身无小写）。 */
function normalizeAnswer(raw: string): string {
  return raw
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

/** 同步生成 4 位验证码（crypto 安全随机数）。 */
export function generateCaptchaCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

function rnd(min: number, max: number): number {
  return min + crypto.randomInt(min, max + 1);
}

/**
 * 验证码 SVG（120×40）：浅色底 + 干扰曲线/噪点 + 逐字旋转抖动与多色字形。
 * 定位是「抬高脚本成本」的轻量门槛，强对抗场景应切 custom 模式接行为验证。
 */
export function captchaSvg(code: string): string {
  const W = 120;
  const H = 40;
  const chars = [...code];
  const n = chars.length;
  const step = (W - 28) / (n - 1);
  const fills = ["#0f172a", "#1e3a8a", "#334155", "#7c2d12", "#164e63"];

  const noise: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x1 = rnd(0, 18);
    const y1 = rnd(4, H - 4);
    const x2 = rnd(W - 18, W);
    const y2 = rnd(4, H - 4);
    noise.push(
      `<path d="M${x1} ${y1} Q ${rnd(30, W - 30)} ${rnd(2, H - 2)} ${x2} ${y2}" fill="none" stroke="#94a3b8" stroke-width="1" opacity="0.55"/>`,
    );
  }
  for (let i = 0; i < 24; i++) {
    noise.push(
      `<circle cx="${rnd(2, W - 2)}" cy="${rnd(2, H - 2)}" r="${(crypto.randomInt(6, 14) / 10).toFixed(1)}" fill="#cbd5e1" opacity="0.7"/>`,
    );
  }

  const glyphs = chars
    .map((ch, i) => {
      const x = 14 + i * step + rnd(-2, 2);
      const y = 28 + rnd(-2, 2);
      const rot = rnd(-20, 20);
      const fill = fills[crypto.randomInt(fills.length)];
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="24" font-weight="700" fill="${fill}">${ch}</text>`;
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" rx="7" fill="#eef2f7"/>` +
    noise.join("") +
    glyphs +
    `</svg>`
  );
}

/**
 * 生成签名令牌：base64url(JSON{答案,jti,过期}) + "." + HMAC-SHA256。
 * async 签名预留给未来接入异步密钥源（KMS 等），当前为同步计算。
 */
export async function signCaptchaToken(code: string): Promise<string> {
  const payload = {
    c: code.toUpperCase(),
    j: crypto.randomUUID(),
    e: Date.now() + TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

type TokenPayload = { c: string; j: string; e: number };

/** 验签并解析令牌；任何异常/篡改/过期都返回 null。 */
function parseToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!timingSafeEqualText(sig, sign(body))) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      c?: unknown;
      j?: unknown;
      e?: unknown;
    };
    if (
      typeof p.c !== "string" ||
      typeof p.j !== "string" ||
      typeof p.e !== "number" ||
      p.e <= Date.now()
    )
      return null;
    return { c: p.c, j: p.j, e: p.e };
  } catch {
    return null;
  }
}

/**
 * 校验内置图形验证码。成功一次性消费 jti；答案错误不消费（允许改答案重试到
 * 过期）；坏签名/过期/重放统一报错，不区分细分原因以免成为探测预言机。
 * 返回 null 表示通过，否则返回中文错误信息。
 */
function verifyBuiltin(answer: string | undefined, cookieToken: string | undefined): string | null {
  const payload = parseToken(cookieToken);
  if (!payload || used.has(payload.j)) return "验证码不正确或已过期";
  if (!answer || !answer.trim()) return "请输入验证码";
  if (normalizeAnswer(answer) !== payload.c) return "验证码不正确或已过期";
  used.set(payload.j, payload.e);
  sweepUsed(Date.now());
  return null;
}

/** 解析自定义请求头：JSON 对象 或 每行 `Key: Value`。 */
function parseHeaders(raw: string): Record<string, string> {
  const text = raw.trim();
  if (!text) return {};
  if (text.startsWith("{")) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = String(v);
    return out;
  }
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/** 按点路径从响应 JSON 取值（如 data.code）；非对象/缺失返回 undefined。 */
function pickPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur && typeof cur === "object") return (cur as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * custom 模式：转发用户凭证到管理员配置的校验接口。
 * - {{token}} 在 URL 中做 URL 编码替换，在请求体中做 JSON 字符串转义替换；
 * - 默认判定：HTTP 2xx 且 JSON 中 ok===true 或 success===true；
 * - 自定义规则 `路径=值`：点路径取值比较（status 取 HTTP 状态码）。
 * 网络/超时/配置错误统一提示「服务暂不可用」，明确拒绝则提示验证码错误。
 */
async function verifyRemote(sec: AdminSecurity, answer: string): Promise<string | null> {
  const token = answer.trim();
  const url = sec.captchaVerifyUrl.replace(/\{\{\s*token\s*\}\}/g, encodeURIComponent(token));
  const method = sec.captchaVerifyMethod;
  const init: RequestInit = {
    method,
    headers: parseHeaders(sec.captchaVerifyHeaders),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  };
  if (method !== "GET" && sec.captchaVerifyBody.trim()) {
    // body 模板一般是 JSON：转义后替换，保证引号/反斜杠不会破坏 JSON 结构。
    const escaped = JSON.stringify(token).slice(1, -1);
    init.body = sec.captchaVerifyBody.replace(/\{\{\s*token\s*\}\}/g, escaped);
  }

  let res: Response;
  let data: unknown = null;
  try {
    res = await fetch(url, init);
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  } catch {
    return "验证码校验服务暂不可用，请稍后再试";
  }

  const rule = sec.captchaVerifySuccess.trim();
  if (!rule) {
    const okFlag =
      res.ok &&
      data &&
      typeof data === "object" &&
      ((data as Record<string, unknown>).ok === true ||
        (data as Record<string, unknown>).success === true);
    return okFlag ? null : "验证码不正确或已过期";
  }
  const eq = rule.indexOf("=");
  const path = rule.slice(0, eq).trim();
  const expected = rule.slice(eq + 1).trim();
  const actual = path === "status" ? res.status : pickPath(data, path);
  return String(actual) === expected ? null : "验证码不正确或已过期";
}

/**
 * 登录 / 找回密码 / 免密登录码的验证码校验。
 * 开关：sec.captchaEnabled；关闭时直接放行（返回 null）。
 */
export async function verifyLoginCaptcha(
  sec: AdminSecurity,
  answer: string | undefined,
  cookieToken: string | undefined,
): Promise<string | null> {
  if (!sec.captchaEnabled) return null;
  if (!answer || !answer.trim()) return "请输入验证码";
  return sec.captchaMode === "custom"
    ? verifyRemote(sec, answer)
    : verifyBuiltin(answer, cookieToken);
}

/**
 * 注册场景的验证码校验：通道复用后台安全配置（模式 / 自定义接口），开关单独
 * 取会员设置 member.captchaEnabled——后台登录不必验，但注册仍可能要求验。
 */
export async function verifyCaptchaFor(
  sec: AdminSecurity,
  enabled: boolean,
  answer: string | undefined,
  cookieToken: string | undefined,
): Promise<string | null> {
  if (!enabled) return null;
  if (!answer || !answer.trim()) return "请输入验证码";
  return sec.captchaMode === "custom"
    ? verifyRemote(sec, answer)
    : verifyBuiltin(answer, cookieToken);
}
