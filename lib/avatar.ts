/**
 * Server-only avatar URL resolver for built-in comments.
 *
 * Supports Gravatar and the popular China-friendly mirrors, plus the special
 * case where a commenter's email is a `@qq.com` address — in that case the QQ
 * number (the local part) resolves straight to the user's QQ avatar via the
 * qlogo API, which is exactly what most Chinese blogs want.
 *
 * This module imports `node:crypto`, so it MUST only be used on the server
 * (API routes / services). Never import it from a client component — the
 * avatar URL is computed here and passed to the browser as a finished string.
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
