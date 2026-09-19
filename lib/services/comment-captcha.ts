/**
 * 评论专用轻量图形验证码（算术题）——无状态签名令牌 + 一次性消费记录。
 *
 * 与登录验证码（lib/services/captcha.ts，cookie 模式）刻意分离：
 * - 评论接口面向匿名访客，答案令牌直接随评论提交体返回，不种 cookie；
 * - 答案不落库：令牌 = base64url(JSON{答案,jti,过期}) + "." + HMAC-SHA256，
 *   密钥复用会话密钥并做域分离，伪造/篡改在验签阶段即被拒；
 * - 防重放：jti 存进程内 Map（单实例部署足够；多实例需换共享存储），
 *   带 TTL 惰性清理与容量上限，正确答案消费一次后同一令牌立即失效；
 * - 零依赖：node:crypto 签名，前端只拿到一张带干扰线/噪点/逐字旋转的 SVG。
 */
import crypto from "node:crypto";
import { getServerSecret } from "@/lib/auth";

const VERSION = "oboe.comment-captcha.v1";
/** 令牌有效期 10 分钟。 */
const TTL_MS = 10 * 60 * 1000;
/** 已消费 jti 的容量上限，超出时按到期时间最旧者淘汰。 */
const USED_CAP = 5000;

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

/** jti -> 到期时间戳；仅记录「已正确消费」的令牌用于防重放。 */
const used = new Map<string, number>();
let lastSweep = 0;

function sweepUsed(now: number) {
  // 每 60s 或容量超限时清理一次过期项。
  if (now - lastSweep < 60_000 && used.size < USED_CAP) return;
  lastSweep = now;
  for (const [jti, exp] of used) {
    if (exp <= now) used.delete(jti);
  }
  // 仍超限（攻击式大量正确解题）：淘汰最早到期的一批。
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
    // 长度不同也要做一次等长比较以摊平时间侧信道。
    const dummy = Buffer.alloc(ba.length);
    crypto.timingSafeEqual(ba, dummy);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/** 全角数字转半角并去除空白，降低移动端输入摩擦。 */
function normalizeAnswer(raw: string): string {
  return raw
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(/\s+/g, "")
    .trim();
}

function rnd(min: number, max: number): number {
  return min + crypto.randomInt(min, max + 1);
}

/** 生成一道加减算术题，保证减法不出现负数。 */
function makePuzzle(): { text: string; answer: number } {
  const a = rnd(1, 9);
  const b = rnd(1, 9);
  if (crypto.randomInt(2) === 0) return { text: `${a}+${b}=?`, answer: a + b };
  const [x, y] = a >= b ? [a, b] : [b, a];
  return { text: `${x}-${y}=?`, answer: x - y };
}

/**
 * 输出内联 SVG：浅色底 + 干扰曲线/噪点 + 逐字随机旋转抖动。
 * 文本仍是机器可读的 DOM 字符——它定位是「挡脚本小子」的轻量门槛，
 * 强对抗场景应由插件改接第三方行为验证（如 Turnstile/reCAPTCHA）。
 */
function renderSvg(text: string): string {
  const W = 120;
  const H = 44;
  const chars = [...text];
  const n = chars.length;
  const step = (W - 26) / (n - 1);
  const fills = ["#0f172a", "#1e3a8a", "#334155", "#7c2d12", "#164e63"];

  const noise: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x1 = rnd(0, 20);
    const y1 = rnd(4, H - 4);
    const x2 = rnd(W - 20, W);
    const y2 = rnd(4, H - 4);
    const cx = rnd(30, W - 30);
    noise.push(
      `<path d="M${x1} ${y1} Q ${cx} ${rnd(2, H - 2)} ${x2} ${y2}" fill="none" stroke="#94a3b8" stroke-width="1" opacity="0.55"/>`,
    );
  }
  for (let i = 0; i < 26; i++) {
    noise.push(
      `<circle cx="${rnd(2, W - 2)}" cy="${rnd(2, H - 2)}" r="${(crypto.randomInt(6, 14) / 10).toFixed(1)}" fill="#cbd5e1" opacity="0.7"/>`,
    );
  }

  const glyphs = chars
    .map((ch, i) => {
      const x = 13 + i * step + rnd(-2, 2);
      const y = 30 + rnd(-3, 3);
      const rot = rnd(-18, 18);
      const fill = fills[crypto.randomInt(fills.length)];
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="23" font-weight="700" fill="${fill}">${ch}</text>`;
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" rx="8" fill="#eef2f7"/>` +
    noise.join("") +
    glyphs +
    `</svg>`
  );
}

export type CommentCaptchaChallenge = { token: string; svg: string };

/** 签发一道新题。 */
export function createCommentCaptcha(): CommentCaptchaChallenge {
  const puzzle = makePuzzle();
  const now = Date.now();
  const payload = { v: puzzle.answer, j: crypto.randomUUID(), e: now + TTL_MS };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, svg: renderSvg(puzzle.text) };
}

/**
 * 校验答案。成功时一次性消费该令牌；任何失败（坏签名/过期/重放/答案错）
 * 都返回 false，且错误答案不消费令牌——用户可改答案重试到过期为止。
 */
export function verifyCommentCaptcha(token: string, answer: string): boolean {
  try {
    if (!token || !answer) return false;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return false;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!timingSafeEqualText(sig, sign(body))) return false;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      v?: unknown;
      j?: unknown;
      e?: unknown;
    };
    if (
      typeof payload.v !== "number" ||
      typeof payload.j !== "string" ||
      typeof payload.e !== "number"
    )
      return false;

    const now = Date.now();
    if (payload.e <= now) return false;
    if (used.has(payload.j)) return false;

    if (normalizeAnswer(answer) !== String(payload.v)) return false;

    used.set(payload.j, payload.e);
    sweepUsed(now);
    return true;
  } catch {
    return false;
  }
}
