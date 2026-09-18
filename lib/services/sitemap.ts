/**
 * 站点地图 / robots.txt 生成服务。
 *
 * 内建输出一份符合 sitemaps.org 0.9 规范的 urlset（含 lastmod、changefreq、
 * priority），并在渲染前触发 `sitemap.urls` 异步过滤器——高级 sitemap 插件
 * 可借此增删条目、注入 `<image:image>` 扩展。robots.txt 同理走 `robots.rules`
 * 过滤器。两个输出都强制先 ensurePluginsLoaded()，保证插件钩子已注册。
 */
import { applyAsyncFilters, applyFilters, HOOKS } from "@/lib/hooks";
import { listPosts } from "./posts";
import { listPages } from "./pages";
import { listCategories, listTags } from "./taxonomies";
import { getPermalinkConfig, blogIndexUrlFor } from "./links";
import { getSettings } from "./settings";
import { ensurePluginsLoaded } from "./plugins";

export type SitemapChangefreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export type SitemapEntry = {
  /** 绝对地址。 */
  loc: string;
  /** W3C 日期，内建统一输出 YYYY-MM-DD。 */
  lastmod?: string;
  changefreq?: SitemapChangefreq;
  /** 字符串形式的 0.0–1.0，渲染前会做格式校验。 */
  priority?: string;
  /** 图片 sitemap 扩展：绝对图片 URL 列表。 */
  images?: string[];
};

type CategoryItem = Awaited<ReturnType<typeof listCategories>>[number];
type TagItem = Awaited<ReturnType<typeof listTags>>[number];
type PostItem = Awaited<ReturnType<typeof listPosts>>["items"][number];
type PageItem = Awaited<ReturnType<typeof listPages>>["items"][number];

export type SitemapPayload = {
  entries: SitemapEntry[];
  base: string;
  posts: PostItem[];
  pages: PageItem[];
  categories: CategoryItem[];
  tags: TagItem[];
};

export type RobotsPayload = {
  lines: string[];
  base: string;
};

const CHANGEFREQS: ReadonlySet<string> = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

/**
 * 从请求头推导站点源站。route handler 拿不到 next/headers，这里直接读
 * x-forwarded-* —— 反向代理后的绝对 URL（sitemap/robots 必需）才不会
 * 错误地写成内网 http://127.0.0.1。
 */
export function originFromRequest(req: Request): string {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host") ||
    "localhost:3000";
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 统一截成 W3C 日期（参考站 sitemap 即为 YYYY-MM-DD）。 */
function day(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function latestDay(items: { updatedAt?: Date | null }[]): string | undefined {
  let best: string | undefined;
  for (const it of items) {
    const d = day(it.updatedAt);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

/** 组装内建条目（插件过滤之前的基线）。 */
async function buildEntries(base: string): Promise<SitemapPayload> {
  const [posts, pages, categories, tags, cfg] = await Promise.all([
    listPosts({ status: "published", limit: 10000, pinned: false }),
    listPages({ status: "published", limit: 10000 }),
    listCategories(),
    listTags(),
    getPermalinkConfig(),
  ]);

  const blogIndex = blogIndexUrlFor(cfg);
  const fresh = latestDay(posts.items);
  const entries: SitemapEntry[] = [
    // 首页与文章列表：更新最频繁，给最高优先级。
    { loc: `${base}/`, lastmod: fresh, changefreq: "daily", priority: "1.0" },
  ];
  // 文章前缀被删空时列表页就是首页，避免重复收录。
  if (blogIndex !== "/") {
    entries.push({
      loc: `${base}${blogIndex}`,
      lastmod: fresh,
      changefreq: "daily",
      priority: "0.8",
    });
  }
  for (const p of posts.items) {
    entries.push({
      loc: `${base}${p.url}`,
      lastmod: day(p.updatedAt ?? p.publishedAt),
      changefreq: "weekly",
      priority: "0.8",
    });
  }
  for (const p of pages.items) {
    entries.push({
      loc: `${base}${p.url}`,
      lastmod: day(p.updatedAt ?? p.publishedAt),
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const c of categories) {
    entries.push({
      loc: `${base}${c.url}`,
      lastmod: day((c as { createdAt?: Date | null }).createdAt),
      changefreq: "weekly",
      priority: "0.6",
    });
  }
  for (const t of tags) {
    entries.push({
      loc: `${base}${t.url}`,
      lastmod: day((t as { createdAt?: Date | null }).createdAt),
      changefreq: "weekly",
      priority: "0.4",
    });
  }

  return {
    entries,
    base,
    posts: posts.items,
    pages: pages.items,
    categories,
    tags,
  };
}

function entryXml(e: SitemapEntry): string {
  const parts = [`<loc>${esc(e.loc)}</loc>`];
  if (e.lastmod) parts.push(`<lastmod>${e.lastmod}</lastmod>`);
  if (e.changefreq && CHANGEFREQS.has(e.changefreq)) {
    parts.push(`<changefreq>${e.changefreq}</changefreq>`);
  }
  // 非法优先级直接丢弃，避免坏插件输出污染整张地图。
  if (e.priority && /^(0(\.\d)?|1(\.0)?)$/.test(e.priority)) {
    parts.push(`<priority>${e.priority}</priority>`);
  }
  for (const img of e.images ?? []) {
    // 图片扩展只接受绝对 http(s) 地址。
    if (/^https?:\/\//i.test(img)) {
      parts.push(
        `<image:image><image:loc>${esc(img)}</image:loc></image:image>`,
      );
    }
  }
  return `<url>${parts.join("")}</url>`;
}

export async function buildSitemapXml(req: Request): Promise<string> {
  const base = originFromRequest(req);
  const payload = await buildEntries(base);

  await ensurePluginsLoaded();
  const filtered = await applyAsyncFilters(HOOKS.sitemapUrls, payload);

  const hasImages = filtered.entries.some((e) => (e.images?.length ?? 0) > 0);
  const ns = hasImages
    ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    : "";
  const body = filtered.entries
    .map((e) => entryXml(e))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>
${body}
</urlset>`;
}

export async function buildRobotsTxt(req: Request): Promise<string> {
  const base = originFromRequest(req);
  const settings = await getSettings();
  await ensurePluginsLoaded();

  // 全站 noindex（隐私/封站模式）：直接禁止所有抓取，也不暴露地图地址。
  if ((settings.seoRobots || "").toLowerCase().includes("noindex")) {
    const blocked = applyFilters(HOOKS.robotsRules, {
      lines: ["User-agent: *", "Disallow: /"],
      base,
    } satisfies RobotsPayload);
    return `${blocked.lines.join("\n").trimEnd()}\n`;
  }

  const payload = applyFilters(HOOKS.robotsRules, {
    lines: [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /api/",
      "Disallow: /search",
      "",
      `Sitemap: ${base}/sitemap.xml`,
    ],
    base,
  } satisfies RobotsPayload);
  return `${payload.lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
