import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getServerSecret } from "@/lib/auth";
import type { AdminSecurity } from "./security";

/**
 * 登录验证码：
 * - builtin：服务端生成 4 位图形码（纯 SVG，无第三方依赖），答案的 sha256
 *   放进 10 分钟有效的 JWT cookie；校验成功即作废（jti 单次有效）。
 * - custom：把用户填写的凭证 POST 到管理员配置的校验接口，{ok:true} 通过。
 * 作废集合存进程内存即可：验证码只防机器人批量撞库，不是安全边界；多实例
 * 部署下各实例各自作废，10 分钟 TTL 兜底。
 */

export const CAPTCHA_COOKIE = "cms_captcha";
const TTL_SEC = 10 * 60;
const CODE_LEN = 4;
// 去掉易混字符 0/O/1/I/L。
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const FILLS = ["#e4e4e7", "#a5b4fc", "#818cf8", "#c7d2fe"];

const usedJtis = new Map<string, number>();

function sweepUsed(nowMs: number) {
  for (const [jti, expMs] of usedJtis) {
    if (expMs <= nowMs) usedJtis.delete(jti);
  }
}

export function generateCaptchaCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return out;
}

function ri(min: number, max: number) {
  return crypto.randomInt(min, max + 1);
}

/** 渲染深色底 SVG 图形码；答案字符带 class="c" 以便（自测）程序化提取。 */
export function captchaSvg(code: string): string {
  const w = 132;
  const h = 46;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" rx="6" fill="#09090b"/>`,
  ];
  for (let i = 0; i < 4; i++) {
    parts.push(
      `<line x1="${ri(0, w)}" y1="${ri(0, h)}" x2="${ri(0, w)}" y2="${ri(0, h)}" stroke="${i % 2 ? "#3f3f46" : "#312e81"}" stroke-width="1" opacity="0.7"/>`,
    );
  }
  for (let i = 0; i < 14; i++) {
    parts.push(
      `<circle cx="${ri(4, w - 4)}" cy="${ri(4, h - 4)}" r="${ri(1, 2) * 0.6 + 0.5}" fill="${i % 3 ? "#52525b" : "#6366f1"}" opacity="0.6"/>`,
    );
  }
  [...code].forEach((ch, i) => {
    const x = 18 + i * 28;
    const y = ri(28, 34);
    const angle = ri(-24, 24);
    const fill = FILLS[ri(0, FILLS.length - 1)];
    parts.push(
      `<text class="c" x="${x}" y="${y}" font-family="ui-monospace,monospace" font-size="26" font-weight="700" fill="${fill}" transform="rotate(${angle} ${x} ${y})">${ch}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

export async function signCaptchaToken(code: string): Promise<string> {
  const hash = crypto
    .createHash("sha256")
    .update(code.toLowerCase())
    .digest("hex");
  return new SignJWT({ h: hash })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TTL_SEC}s`)
    .sign(getServerSecret());
}

/** 答案比对不区分大小写；仅校验成功才消费 jti，输错可在有效期内重试。 */
export async function verifyCaptchaToken(
  token: string,
  answer: string,
): Promise<boolean> {
  let payload: { jti?: string; exp?: number; h?: string };
  try {
    payload = (await jwtVerify(token, getServerSecret())).payload;
  } catch {
    return false;
  }
  if (!payload.jti || !payload.h) return false;
  sweepUsed(Date.now());
  if (usedJtis.has(payload.jti)) return false;
  const hash = crypto
    .createHash("sha256")
    .update(answer.trim().toLowerCase())
    .digest("hex");
  if (hash !== payload.h) return false;
  usedJtis.set(payload.jti, (payload.exp ?? 0) * 1000);
  return true;
}

type CustomResult = "ok" | "wrong" | "unavailable";

/** 自定义校验：POST { token }，8 秒超时，HTTP 200 且 ok/success 为真才通过。 */
export async function verifyCustomCaptcha(
  url: string,
  token: string,
): Promise<CustomResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return "wrong";
    const j = (await res.json().catch(() => null)) as
      | { ok?: unknown; success?: unknown }
      | null;
    return j && (j.ok === true || j.success === true) ? "ok" : "wrong";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 统一验证码入口：返回错误消息字符串表示拒绝，null 表示放行。
 * 验证码在账号密码之前校验，避免未过验证码时被当作账号探测预言机。
 * `enabled` 由调用方按场景给出（后台登录 / 前台注册开关相互独立），
 * 校验通道（builtin 图形码 / custom 接口）统一取后台安全配置。
 */
export async function verifyCaptchaFor(
  sec: AdminSecurity,
  enabled: boolean,
  answer: string | undefined,
  cookieValue: string | undefined,
): Promise<string | null> {
  if (!enabled) return null;
  const value = (answer ?? "").trim();
  if (!value) return "请输入验证码";
  if (sec.captchaMode === "custom") {
    if (!sec.captchaVerifyUrl) return "验证码未正确配置，请联系管理员";
    const r = await verifyCustomCaptcha(sec.captchaVerifyUrl, value);
    if (r === "unavailable") return "验证码服务暂不可用，请稍后再试";
    if (r === "wrong") return "验证码校验失败";
    return null;
  }
  if (!cookieValue) return "验证码已过期，请点击图片刷新";
  const good = await verifyCaptchaToken(cookieValue, value);
  return good ? null : "验证码错误或已过期";
}

/** 后台登录路由的便捷封装：开关取登录验证码配置。 */
export function verifyLoginCaptcha(
  sec: AdminSecurity,
  answer: string | undefined,
  cookieValue: string | undefined,
): Promise<string | null> {
  return verifyCaptchaFor(sec, sec.captchaEnabled, answer, cookieValue);
}
