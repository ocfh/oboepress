import { cache } from "react";
import { getOption, setOption } from "./options";
import { pinyinSlug } from "@/lib/pinyin";
import type { PostListItem } from "./posts";
import type { PageListItem } from "./pages";
import type { Category, Tag } from "@/db/schema";
import { bumpAll } from "./public-cache";

/**
 * Single gateway for every public URL on the site.
 *
 * Config lives in the options KV store (key "permalinks") — no migration
 * needed. Prefixes are independently editable and may be empty (root level);
 * post links support raw slug / id / pinyin / initials / a custom token
 * pattern. All href generation MUST go through here so changing a prefix
 * rewires the whole site at once.
 */

export type PostLinkMode = "slug" | "id" | "pinyin" | "initial" | "custom";

export interface PermalinkConfig {
  /** How the post tail is derived: stored slug (default), numeric id, pinyin,
   *  pinyin initials, or `postPattern` tokens. */
  postMode: PostLinkMode;
  /** Custom tail pattern for postMode "custom": {id} {slug} {pinyin} {initial}
   *  {year} {month} {day}, "/" may add directories. */
  postPattern: string;
  /** Path prefixes; "" = root. Defaults reproduce blog/, pages/, blog/category/, blog/tag/. */
  postBase: string;
  pageBase: string;
  categoryBase: string;
  tagBase: string;
}

const OPTION_KEY = "permalinks";

export const DEFAULT_PERMALINKS: PermalinkConfig = {
  postMode: "slug",
  postPattern: "{slug}",
  postBase: "blog",
  pageBase: "pages",
  categoryBase: "blog/category",
  tagBase: "blog/tag",
};

const MODES: PostLinkMode[] = ["slug", "id", "pinyin", "initial", "custom"];

/** Normalize a user-entered base path: trim slashes/spaces, keep word chars. */
export function normalizeBase(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/")
    .replace(/[^\p{L}\p{N}\-/_]/gu, "")
    .toLowerCase();
}

function normalizePattern(raw: unknown): string {
  const p = String(raw ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return /\{(id|slug|pinyin|initial)\}/.test(p) ? p : "{slug}";
}

export function normalizePermalinkConfig(input: Partial<PermalinkConfig>): PermalinkConfig {
  const cfg: PermalinkConfig = {
    postMode: MODES.includes(input.postMode as PostLinkMode)
      ? (input.postMode as PostLinkMode)
      : DEFAULT_PERMALINKS.postMode,
    postPattern: normalizePattern(input.postPattern ?? DEFAULT_PERMALINKS.postPattern),
    postBase: normalizeBase(input.postBase ?? DEFAULT_PERMALINKS.postBase),
    pageBase: normalizeBase(input.pageBase ?? DEFAULT_PERMALINKS.pageBase),
    categoryBase: normalizeBase(input.categoryBase ?? DEFAULT_PERMALINKS.categoryBase),
    tagBase: normalizeBase(input.tagBase ?? DEFAULT_PERMALINKS.tagBase),
  };
  if (cfg.postMode !== "custom") cfg.postPattern = "{slug}";
  return cfg;
}

/** 请求级去重：一次公开渲染中 URL 生成器（Layout/CatNav/卡片/分类列表）
 *  会读取配置 5+ 次；规范化结果在请求内不变，合并为一次 KV 读取。 */
export const getPermalinkConfig = cache(async (): Promise<PermalinkConfig> => {
  const stored = (await getOption<Partial<PermalinkConfig>>(OPTION_KEY, {})) ?? {};
  return normalizePermalinkConfig({ ...DEFAULT_PERMALINKS, ...stored });
});

export async function savePermalinkConfig(input: Partial<PermalinkConfig>): Promise<PermalinkConfig> {
  const cfg = normalizePermalinkConfig(input);
  await setOption(OPTION_KEY, cfg);
  // A switch to pinyin/initials must make every pre-0012 post resolvable
  // immediately. Backfill is a cheap no-op once all rows carry their tails.
  if (cfg.postMode === "pinyin" || cfg.postMode === "initial" ||
      (cfg.postMode === "custom" && /\{(pinyin|initial)\}/.test(cfg.postPattern))) {
    const { backfillPostLinkSlugs } = await import("./posts");
    await backfillPostLinkSlugs();
  }
  // 链接形式变化会改写全站所有 URL（缓存产物内嵌 url），回填完成后再全站失效。
  bumpAll();
  return cfg;
}

const baseSegs = (base: string): string[] => (base ? base.split("/").filter(Boolean) : []);

const joinPath = (parts: (string | number)[]): string => {
  const segs = parts.map((p) => String(p)).filter(Boolean);
  return segs.length ? "/" + segs.join("/") : "/";
};

type PostUrlInput = {
  id: number;
  slug: string;
  title?: string | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

function dateParts(post: PostUrlInput): { year: string; month: string; day: string } {
  const d = post.publishedAt ? new Date(post.publishedAt) : post.createdAt ? new Date(post.createdAt) : new Date();
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, "0"),
    day: String(d.getDate()).padStart(2, "0"),
  };
}

/** Tail segments for a post under the current mode (the variable part after the base). */
export function postTailSegments(cfg: PermalinkConfig, post: PostUrlInput): string[] {
  switch (cfg.postMode) {
    case "id":
      return [String(post.id)];
    case "pinyin":
      return [post.title ? pinyinSlug(post.title, "full") : post.slug];
    case "initial":
      return [post.title ? pinyinSlug(post.title, "initial") : post.slug];
    case "custom":
      return renderPostPattern(cfg.postPattern, post);
    default:
      return [post.slug];
  }
}

/** Render a custom token pattern to concrete path segments. */
export function renderPostPattern(pattern: string, post: PostUrlInput): string[] {
  const dt = dateParts(post);
  const tokens: Record<string, string> = {
    "{id}": String(post.id),
    "{slug}": post.slug,
    "{pinyin}": post.title ? pinyinSlug(post.title, "full") : post.slug,
    "{initial}": post.title ? pinyinSlug(post.title, "initial") : post.slug,
    "{year}": dt.year,
    "{month}": dt.month,
    "{day}": dt.day,
  };
  return pattern
    .split("/")
    .map((seg) => seg.replace(/\{(id|slug|pinyin|initial|year|month|day)\}/g, (k) => tokens[k] ?? ""))
    .filter(Boolean);
}

export function postUrlFor(cfg: PermalinkConfig, post: PostUrlInput): string {
  return joinPath([...baseSegs(cfg.postBase), ...postTailSegments(cfg, post)]);
}

export async function postUrl(post: PostUrlInput): Promise<string> {
  return postUrlFor(await getPermalinkConfig(), post);
}

export function pageUrlFor(cfg: PermalinkConfig, page: { slug: string }): string {
  return joinPath([...baseSegs(cfg.pageBase), page.slug]);
}

export function categoryUrlFor(cfg: PermalinkConfig, cat: { slug: string }): string {
  return joinPath([...baseSegs(cfg.categoryBase), cat.slug]);
}

export function tagUrlFor(cfg: PermalinkConfig, tag: { slug: string }): string {
  return joinPath([...baseSegs(cfg.tagBase), tag.slug]);
}

export async function pageUrl(page: { slug: string }): Promise<string> {
  return pageUrlFor(await getPermalinkConfig(), page);
}
export async function categoryUrl(cat: { slug: string }): Promise<string> {
  return categoryUrlFor(await getPermalinkConfig(), cat);
}
export async function tagUrl(tag: { slug: string }): Promise<string> {
  return tagUrlFor(await getPermalinkConfig(), tag);
}

/** Post listing index (the post base itself); "/" when posts live at root. */
export function blogIndexUrlFor(cfg: PermalinkConfig): string {
  return joinPath(baseSegs(cfg.postBase));
}
export async function blogIndexUrl(): Promise<string> {
  return blogIndexUrlFor(await getPermalinkConfig());
}

/** Pagination href: page 1 is the plain path, later pages carry ?page=. */
export function paginate(path: string, page: number): string {
  const base = path === "/" ? "" : path;
  return page <= 1 ? path : `${base || ""}/?page=${page}`;
}

// ---------------------------------------------------------------------------
// Resolution (routes side)
// ---------------------------------------------------------------------------

/** Which persisted column a captured tail segment reverses through. */
type SlugKind = "slug" | "pinyin" | "initial";

type TailMatcher = {
  regex: RegExp;
  hasId: boolean;
  slugGroup: SlugKind | null;
  segCount: number;
};

/** Compile the active post tail shape (custom pattern → named-group regex). */
export function buildTailMatcher(cfg: PermalinkConfig): TailMatcher {
  if (cfg.postMode === "custom") {
    const groups = cfg.postPattern.split("/").map((seg) =>
      seg
        .replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === "{" || ch === "}" ? ch : "\\" + ch))
        .replace(/\{id\}/g, "(?<id>\\d+)")
        .replace(/\{pinyin\}/g, "(?<pinyin>[^/]+)")
        .replace(/\{initial\}/g, "(?<initial>[^/]+)")
        .replace(/\{slug\}/g, "(?<slug>[^/]+)")
        .replace(/\{year\}/g, "(?<year>\\d{4})")
        .replace(/\{(month|day)\}/g, "(?<$1>\\d{1,2})"),
    );
    const pattern = groups.join("/");
    // Reverse-lookup preference: id > pinyin > initial > slug (a pattern
    // containing several text tokens is exotic; this order stays deterministic).
    const slugGroup: SlugKind | null = pattern.includes("(?<pinyin>")
      ? "pinyin"
      : pattern.includes("(?<initial>")
        ? "initial"
        : pattern.includes("(?<slug>")
          ? "slug"
          : null;
    return {
      regex: new RegExp("^" + pattern + "$"),
      hasId: pattern.includes("(?<id>"),
      slugGroup,
      segCount: groups.length,
    };
  }
  if (cfg.postMode === "id") {
    return { regex: /^(?<id>\d+)$/, hasId: true, slugGroup: null, segCount: 1 };
  }
  const kind: SlugKind = cfg.postMode === "pinyin" ? "pinyin" : cfg.postMode === "initial" ? "initial" : "slug";
  return { regex: new RegExp(`^(?<${kind}>[^/]+)$`), hasId: false, slugGroup: kind, segCount: 1 };
}

/** Pure: does a tail match the post shape, and which lookup key does it yield? */
export function matchPostTail(
  cfg: PermalinkConfig,
  tail: string[],
): { id?: number; slug?: string; slugKind?: SlugKind; dateParts?: Record<string, string> } | null {
  const m = buildTailMatcher(cfg);
  if (tail.length !== m.segCount) return null;
  const hit = tail.join("/").match(m.regex);
  if (!hit) return null;
  const g = hit.groups ?? {};
  // 日期 token 只做形状匹配，真值要在拿到文章后回校，否则 /1999/1 会误中。
  const dateParts: Record<string, string> = {};
  for (const k of ["year", "month", "day"] as const) if (g[k]) dateParts[k] = g[k];
  const key = { dateParts: Object.keys(dateParts).length ? dateParts : undefined };
  if (m.hasId && g.id) return { id: Number(g.id), ...key };
  if (m.slugGroup && g[m.slugGroup]) {
    return { slug: decodeURIComponent(g[m.slugGroup]), slugKind: m.slugGroup, ...key };
  }
  return null;
}

/** 校验 URL 中的 {year}/{month}/{day} 与文章实际日期一致（本地时区，与生成端同源）。 */
function dateTokensMatch(post: PostListItem, parts: Record<string, string>): boolean {
  const d = post.publishedAt ? new Date(post.publishedAt)
    : post.createdAt ? new Date(post.createdAt) : new Date();
  const actual: Record<string, string> = {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, "0"),
    day: String(d.getDate()).padStart(2, "0"),
  };
  return Object.entries(parts).every(([k, v]) => v.padStart(2, "0") === actual[k]);
}

/** Resolve a post tail to a published post (null when nothing matches). */
async function fetchPostByTail(
  tail: string[],
  cfg: PermalinkConfig,
  includeUnpublished: boolean,
): Promise<PostListItem | null> {
  const key = matchPostTail(cfg, tail);
  if (!key) return null;
  const { getPostById, getPostBySlug, getPostByPinyin, getPostByInitial } = await import("./posts");
  try {
    let post: PostListItem | null = null;
    if (key.id) post = await getPostById(key.id, includeUnpublished);
    else if (key.slug) {
      if (key.slugKind === "pinyin") post = await getPostByPinyin(key.slug, includeUnpublished);
      else if (key.slugKind === "initial") post = await getPostByInitial(key.slug, includeUnpublished);
      else post = await getPostBySlug(key.slug, includeUnpublished);
    }
    if (post && key.dateParts && !dateTokensMatch(post, key.dateParts)) return null;
    return post;
  } catch {
    return null;
  }
}

export type SitePathResolution =
  | { kind: "home" }
  | { kind: "blogIndex" }
  | { kind: "post"; post: PostListItem }
  | { kind: "page"; page: PageListItem }
  | { kind: "category"; category: Category }
  | { kind: "tag"; tag: Tag };

function startsWith(segs: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((s, i) => s === segs[i]);
}

/**
 * Resolve an arbitrary site path (used by the root catch-all, so prefixes can
 * be renamed or deleted). Root-level collisions resolve post → page →
 * category → tag; ponytail: cross-type same-slug collisions are left to
 * authors, upgrade path is a per-type disambiguation table.
 */
export async function resolveSitePath(
  rawSegments: string[],
  opts: { includeUnpublished?: boolean } = {},
): Promise<SitePathResolution | null> {
  const cfg = await getPermalinkConfig();
  const segments = rawSegments.map((s) => decodeURIComponent(s)).filter(Boolean);
  if (!segments.length) return { kind: "home" };

  const includeUnpublished = opts.includeUnpublished ?? false;
  const pb = baseSegs(cfg.postBase);
  const pgb = baseSegs(cfg.pageBase);
  const cb = baseSegs(cfg.categoryBase);
  const tb = baseSegs(cfg.tagBase);
  const tailMatcher = buildTailMatcher(cfg);

  // Post listing index: exact match of a non-empty post base.
  if (pb.length && segments.length === pb.length && startsWith(segments, pb)) {
    return { kind: "blogIndex" };
  }

  // Prefixed entities.
  if (startsWith(segments, pb)) {
    const post = await fetchPostByTail(segments.slice(pb.length), cfg, includeUnpublished);
    if (post) return { kind: "post", post };
  }
  if (startsWith(segments, pgb) && segments.length === pgb.length + 1) {
    const { getPageBySlug } = await import("./pages");
    try {
      return { kind: "page", page: await getPageBySlug(segments[pgb.length], includeUnpublished) };
    } catch {
      /* fall through */
    }
  }
  if (startsWith(segments, cb) && segments.length === cb.length + 1) {
    const { getCategoryBySlug } = await import("./taxonomies");
    const category = await getCategoryBySlug(segments[cb.length]);
    if (category) return { kind: "category", category };
  }
  if (startsWith(segments, tb) && segments.length === tb.length + 1) {
    const { getTagBySlug } = await import("./taxonomies");
    const tag = await getTagBySlug(segments[tb.length]);
    if (tag) return { kind: "tag", tag };
  }

  // Root-level single segment (prefixes deleted): try every entity type.
  if (segments.length === 1) {
    const post = await fetchPostByTail(segments, cfg, includeUnpublished);
    if (post) return { kind: "post", post };
    const { getPageBySlug } = await import("./pages");
    try {
      return { kind: "page", page: await getPageBySlug(segments[0], includeUnpublished) };
    } catch {
      /* continue */
    }
    const { getCategoryBySlug, getTagBySlug } = await import("./taxonomies");
    const category = await getCategoryBySlug(segments[0]);
    if (category) return { kind: "category", category };
    const tag = await getTagBySlug(segments[0]);
    if (tag) return { kind: "tag", tag };
    return null;
  }

  // Posts at root with multi-segment custom patterns (e.g. {year}/{slug}).
  if (pb.length === 0 && segments.length === tailMatcher.segCount) {
    const post = await fetchPostByTail(segments, cfg, includeUnpublished);
    if (post) return { kind: "post", post };
  }

  return null;
}
