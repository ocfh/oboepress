import type { Metadata } from "next";
import { headers } from "next/headers";
import type { SiteSettings } from "@/db/schema";
import { formatSeoTitle } from "./settings";

/**
 * Central SEO layer. Root layout builds site-wide defaults with
 * {@link buildSiteMetadata}; the public catch-all enriches a single resolved
 * entity with {@link buildEntityMetadata}. Next.js deep-merges the two, so an
 * entity only overrides what it actually defines (e.g. a post without its own
 * keywords still inherits the site-wide keyword list).
 *
 * {@link buildHeadContext} feeds the same facts to the `head.tags` plugin
 * filter (used by seo-schema to emit JSON-LD), keeping metadata and structured
 * data derived from one source of truth.
 */

/** Absolute origin of the current request (host-derived; no setting needed). */
export function siteOrigin(): string {
  const h = headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto =
    h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

export function absoluteUrl(path: string, origin = siteOrigin()): string {
  if (/^https?:\/\//i.test(path)) return path;
  return origin + (path.startsWith("/") ? path : `/${path}`);
}

/** Split a comma / Chinese-comma / semicolon / newline keyword string. */
export function splitKeywords(raw?: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,，;；\n\r\t]+/)) {
    const k = part.trim();
    if (k) seen.add(k);
  }
  return [...seen];
}

function iso(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Translate the stored `%title% - %site%` template into a Next `%s` template. */
function nextTitleTemplate(s: SiteSettings): string {
  const tpl = (s.seoTitleTemplate || "%title% - %site%")
    .replace(/%title%/g, "%s")
    .replace(/%site%/g, s.siteTitle)
    .replace(/%tagline%/g, s.tagline ?? "")
    .trim();
  // Next silently drops the page title when the template has no %s token.
  return tpl.includes("%s") ? tpl : `%s - ${tpl || s.siteTitle}`;
}

function robotsOf(s: SiteSettings): Metadata["robots"] {
  const raw = (s.seoRobots || "index,follow").toLowerCase();
  return {
    index: !raw.includes("noindex"),
    follow: !raw.includes("nofollow"),
  };
}

function verificationOf(s: SiteSettings): Metadata["verification"] | undefined {
  const v = s.verifications as Record<string, string> | null;
  if (!v || typeof v !== "object") return undefined;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const val = v[k];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return undefined;
  };
  const google = pick("google", "google-site-verification");
  const yandex = pick("yandex", "yandex-verification");
  const other: Record<string, string> = {};
  const bing = pick("bing", "msvalidate.01");
  if (bing) other["msvalidate.01"] = bing;
  const yahoo = pick("yahoo", "y_key");
  if (yahoo) other["y_key"] = yahoo;
  if (!google && !yandex && Object.keys(other).length === 0) return undefined;
  return {
    google: google ?? undefined,
    yandex: yandex ?? undefined,
    other: Object.keys(other).length ? other : undefined,
  };
}

/** Site-wide metadata emitted on every route via the root layout. */
export function buildSiteMetadata(s: SiteSettings): Metadata {
  const origin = siteOrigin();
  const description =
    s.siteDescription || s.seoDefaultDescription || undefined;
  const keywords = splitKeywords(s.seoKeywords);
  const ogImage = s.ogImageUrl || undefined;

  return {
    metadataBase: new URL(origin),
    title: { default: s.siteTitle, template: nextTitleTemplate(s) },
    description,
    keywords: keywords.length ? keywords : undefined,
    robots: robotsOf(s),
    icons: s.faviconUrl ? { icon: s.faviconUrl } : undefined,
    openGraph: {
      type: "website",
      siteName: s.siteTitle,
      title: s.siteTitle,
      description,
      url: origin,
      locale: "zh_CN",
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card:
        (s.twitterCard as "summary" | "summary_large_image") ||
        "summary_large_image",
      site: s.twitterSite || undefined,
      title: s.siteTitle,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    verification: verificationOf(s),
  };
}

/** A resolved public entity normalized for SEO. Built by the catch-all page. */
export type SeoTarget = {
  kind: "home" | "blogIndex" | "post" | "page" | "category" | "tag";
  /** Real display title (headline). */
  title?: string | null;
  /** Author-written SEO title override. */
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  /** Fallback description source: excerpt / category description. */
  excerpt?: string | null;
  image?: string | null;
  /** Site-relative canonical path. */
  url?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  authorName?: string | null;
};

function composedTitle(s: SiteSettings, raw: string): string {
  return formatSeoTitle(s.seoTitleTemplate || "%title% - %site%", {
    title: raw,
    site: s.siteTitle,
    tagline: s.tagline ?? undefined,
  });
}

/** Entity-specific metadata; Next merges this over the site-wide defaults. */
export function buildEntityMetadata(
  target: SeoTarget,
  s: SiteSettings,
): Metadata {
  const origin = siteOrigin();
  const rawTitle = target.seoTitle || target.title || s.siteTitle;
  const description =
    target.seoDescription ||
    target.excerpt ||
    s.seoDefaultDescription ||
    s.siteDescription ||
    undefined;
  const keywords = splitKeywords(target.seoKeywords);
  const image = target.image || s.ogImageUrl || undefined;
  const canonical =
    target.kind === "home"
      ? origin
      : target.url
        ? absoluteUrl(target.url, origin)
        : undefined;
  const fullTitle = composedTitle(s, rawTitle);
  const isArticle = target.kind === "post";
  const isHome = target.kind === "home";
  // Undefined child titles do NOT fall back to the root `title.default` in
  // Next's metadata merge, so home pins an absolute title (skips the template
  // to avoid "Site - Site"); every other entity passes a raw title composed
  // through the root template.
  const title = isHome ? { absolute: s.siteTitle } : rawTitle;
  // Social cards always want a complete title: plain site name on home,
  // template-composed elsewhere.
  const socialTitle = isHome ? s.siteTitle : fullTitle;

  return {
    title,
    description,
    keywords: keywords.length ? keywords : undefined,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: isArticle ? "article" : "website",
      title: socialTitle,
      description,
      url: canonical,
      images: image ? [image] : undefined,
      publishedTime: isArticle ? iso(target.publishedAt) : undefined,
      modifiedTime: isArticle
        ? (iso(target.updatedAt) ?? iso(target.publishedAt))
        : undefined,
      authors: isArticle && target.authorName ? [target.authorName] : undefined,
    },
    twitter: {
      card:
        (s.twitterCard as "summary" | "summary_large_image") ||
        "summary_large_image",
      site: s.twitterSite || undefined,
      title: socialTitle,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export type HeadContext = {
  kind: "home" | "post" | "page" | "archive" | "taxonomy" | "search";
  siteTitle: string;
  siteUrl: string;
  title?: string;
  description?: string;
  image?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  author?: string;
  url?: string;
  breadcrumbs?: { label: string; href: string }[];
};

/** Normalize an entity + settings into the `head.tags` plugin payload. */
export function buildHeadContext(target: SeoTarget, s: SiteSettings): HeadContext {
  const origin = siteOrigin();
  const pluginKind: HeadContext["kind"] =
    target.kind === "home"
      ? "home"
      : target.kind === "post"
        ? "post"
        : target.kind === "page"
          ? "page"
          : target.kind === "blogIndex"
            ? "archive"
            : "taxonomy";

  const description =
    target.seoDescription ||
    target.excerpt ||
    s.seoDefaultDescription ||
    s.siteDescription ||
    "";
  const relImage = target.image || s.ogImageUrl || null;
  const url = target.url ? absoluteUrl(target.url, origin) : origin;

  let breadcrumbs: { label: string; href: string }[] = [];
  if (target.kind === "post" || target.kind === "page") {
    breadcrumbs = [
      { label: "首页", href: "/" },
      { label: target.title ?? "", href: target.url ?? "/" },
    ];
  } else if (target.kind === "blogIndex") {
    breadcrumbs = [
      { label: "首页", href: "/" },
      { label: "文章", href: target.url ?? "/" },
    ];
  } else if (target.kind === "category") {
    breadcrumbs = [
      { label: "首页", href: "/" },
      { label: target.title ?? "", href: target.url ?? "/" },
    ];
  } else if (target.kind === "tag") {
    breadcrumbs = [
      { label: "首页", href: "/" },
      { label: `#${target.title ?? ""}`, href: target.url ?? "/" },
    ];
  }

  return {
    kind: pluginKind,
    siteTitle: s.siteTitle,
    siteUrl: origin,
    title: target.title || s.siteTitle,
    description,
    image: relImage ? absoluteUrl(relImage, origin) : undefined,
    publishedAt: iso(target.publishedAt),
    updatedAt: iso(target.updatedAt),
    author: target.authorName ?? undefined,
    url,
    breadcrumbs,
  };
}

/** Google Analytics / gtag snippet for a configured measurement id. */
export function analyticsSnippet(s: SiteSettings): string {
  const id = (s.analyticsId || "").trim();
  // Measurement id is [A-Za-z0-9_-]+ only — reject anything that could break
  // out of the attribute/string.
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});</script>`;
}
