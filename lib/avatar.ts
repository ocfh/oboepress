/**
 * Server-only avatar URL resolver（内置评论）。支持 Gravatar 及国内镜像；
 * `@qq.com` 邮箱按 QQ 号直连 qlogo 取头像。引用了 node:crypto，
 * 仅供服务端使用，绝不可在客户端组件里 import。
 */
import { createHash } from "node:crypto";

export type AvatarSource =
  | "gravatar"
  | "cn-gravatar"
  | "cravatar"
  | "weavatar"
  | "libravatar"
  | "qq"
  | "none";

export interface AvatarOptions {
  source?: AvatarSource;
  /** Pixel size of the square avatar (Gravatar-like services only). */
  size?: number;
  /** Gravatar fallback image: 404 | mp | identicon | monsterid | wavatar | retro | robohash | blank. */
  default?: string;
  /** Gravatar content rating: g | pg | r | x. */
  rating?: string;
}

function md5(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * Resolve an avatar URL for a commenter.
 *
 * @param email  the commenter's email (may be null/empty)
 * @returns a URL string, or null when the source is "none" or the email is
 *          missing and no deterministic fallback is possible.
 */
export function getAvatarUrl(
  email: string | null | undefined,
  opts: AvatarOptions = {},
): string | null {
  const source: AvatarSource = opts.source ?? "gravatar";
  const size = opts.size ?? 80;
  if (source === "none") return null;

  const normalized = (email ?? "").trim().toLowerCase();
  const hasEmail = normalized.length > 0;

  // QQ email → QQ avatar. The local part of a *@qq.com address IS the QQ
  // number, which the qlogo API turns into the user's avatar directly.
  if (source === "qq" && normalized.endsWith("@qq.com")) {
    const qq = normalized.split("@")[0];
    if (/^\d{5,12}$/.test(qq)) {
      return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=${size}`;
    }
  }

  // Gravatar-family services all key off an MD5 of the lower-cased email.
  if (!hasEmail) return null;
  const hash = md5(normalized);
  const def = opts.default ?? "identicon";
  const rating = opts.rating ?? "g";
  const qs = `s=${size}&d=${encodeURIComponent(def)}&r=${encodeURIComponent(rating)}`;

  switch (source) {
    case "cn-gravatar":
      return `https://cn.gravatar.com/avatar/${hash}?${qs}`;
    case "cravatar":
      return `https://cravatar.cn/avatar/${hash}?${qs}`;
    case "weavatar":
      return `https://weavatar.com/avatar/${hash}?${qs}`;
    case "libravatar":
      return `https://seccdn.libravatar.org/avatar/${hash}?${qs}`;
    case "qq":
      // Non-QQ email under the "qq" source: fall back to cravatar so a real
      // avatar still shows instead of a broken image.
      return `https://cravatar.cn/avatar/${hash}?${qs}`;
    case "gravatar":
    default:
      return `https://www.gravatar.com/avatar/${hash}?${qs}`;
  }
}
