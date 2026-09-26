import type { Block } from "@/lib/blocks";
import { definePlugin } from "@/lib/plugins/api";
import { getSettings } from "@/lib/services/settings";
import type {
  RobotsPayload,
  SitemapChangefreq,
  SitemapDocumentPayload,
  SitemapEntry,
  SitemapPayload,
} from "@/lib/services/sitemap";
import {
  renderSitemapEntry,
  renderSitemapIndex,
  renderSitemapUrlset,
} from "@/lib/services/sitemap";

/**
 * 高级站点地图插件 1.1.0：
 * - `sitemap.urls`：收录范围开关、lastmod/changefreq/priority 覆盖、
 *   image:image 扩展、关键词排除、自定义 URL（1.0 行为，全部保留）
 * - `sitemap.document`：
 *   1) ?kind=news 输出 Google News 新闻站点地图（仅最近 N 小时文章，
 *      publication 名取站点名称 siteTitle，语言/时间窗可配）；
 *   2) ?part=n 按 50000 条 / 50MB 双预算贪心输出第 n 个分片；
 *   3) 无查询参数且条目超量时，把默认 urlset 整体替换为 sitemapindex。
 * - `robots.rules`：开启新闻地图时追加其 Sitemap 声明。
 * 阈值做成设置项，联调时可用小值真实触发分片，无需造 5 万条数据。
 */

type Settings = {
  includePages: boolean;
  includeCategories: boolean;
  includeTags: boolean;
  lastmodSource: "updated" | "published";
  changefreq: string;
  postPriority: string;
  pagePriority: string;
  images: boolean;
  imageFeatured: boolean;
  imageContent: boolean;
  excludeKeywords: string;
  extraUrls: string;
  // 1.1 新增
  newsEnabled: boolean;
  newsLanguage: string;
  newsHours: number;
  shardMaxUrls: number;
  shardMaxMb: number;
};

const CHANGEFREQS = new Set<string>([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

function day(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absolute(u: string, base: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return base + (u.startsWith("/") ? u : `/${u}`);
}

/** 从结构化内容里抽取正文图片地址（图片块 + 受信 HTML 块里的 <img>）。 */
function contentImages(blocks: Block[] | null | undefined): string[] {
  if (!Array.isArray(blocks)) return [];
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "image" && b.url) {
      out.push(b.url);
    } else if (b.type === "html") {
      for (const m of b.html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
        out.push(m[1]);
      }
    }
  }
  return out;
}

function lines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 一个分片：条目列表 + 分片内最大 lastmod（写入 sitemapindex）。 */
type Shard = { entries: SitemapEntry[]; lastmod?: string };

/**
 * 按 sitemaps.org 双上限（50000 条 / 50MB 未压缩）贪心分片。
 * 字节预算用核心同一渲染器逐字节计算；单条即使超限也独占一片
 * （URL 无法再拆，真实数据里不会发生）。
 */
function buildShards(
  entries: SitemapEntry[],
  maxUrls: number,
  maxBytes: number,
): Shard[] {
  const limit = Math.max(1, Math.floor(maxUrls) || 1);
  const budget = Math.max(1024, Math.floor(maxBytes) || 1);
  const shards: Shard[] = [];
  let cur: SitemapEntry[] = [];
  let curBytes = 0;
  let curLast: string | undefined;

  const flush = () => {
    shards.push({ entries: cur, lastmod: curLast });
    cur = [];
    curBytes = 0;
    curLast = undefined;
  };

  for (const e of entries) {
    // +1 对应条目之间的换行符。
    const bytes = Buffer.byteLength(renderSitemapEntry(e), "utf8") + 1;
    if (cur.length >= limit || (cur.length > 0 && curBytes + bytes > budget)) {
      flush();
    }
    cur.push(e);
    curBytes += bytes;
    if (e.lastmod && (!curLast || e.lastmod > curLast)) curLast = e.lastmod;
  }
  flush();
  return shards;
}

/** Google News 新闻地图文档（news 命名空间，只含文章）。 */
function renderNewsXml(
  items: { loc: string; date: string; title: string }[],
  language: string,
  publication: string,
): string {
  const body = items
    .map(
      (it) =>
        `<url><loc>${esc(it.loc)}</loc>` +
        `<news:news><news:publication>` +
        `<news:name>${esc(publication)}</news:name>` +
        `<news:language>${esc(language)}</news:language>` +
        `</news:publication>` +
        `<news:publication_date>${it.date}</news:publication_date>` +
        `<news:title>${esc(it.title)}</news:title>` +
        `</news:news></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${body}
</urlset>`;
}

export default definePlugin<Settings>({
  setup({ settings, addFilter, HOOKS }) {
    // ── 1.0 既有行为：条目级增强 ──────────────────────────────────────
    addFilter<SitemapPayload>(HOOKS.sitemapUrls, async (payload) => {
      const { base } = payload;
      // 以 URL 反查源实体——核心构建顺序不构成契约，按地址关联最稳。
      const postByLoc = new Map(
        payload.posts.map((p) => [`${base}${p.url}`, p]),
      );
      const pageByLoc = new Map(
        payload.pages.map((p) => [`${base}${p.url}`, p]),
      );
      const catLocs = new Set(payload.categories.map((c) => `${base}${c.url}`));
      const tagLocs = new Set(payload.tags.map((t) => `${base}${t.url}`));
      const excludes = lines(settings.excludeKeywords);

      const cf = (CHANGEFREQS.has(settings.changefreq)
        ? settings.changefreq
        : "weekly") as SitemapChangefreq;

      const collectImages = (
        featured: string | null,
        blocks: Block[] | null,
      ): string[] | undefined => {
        if (!settings.images) return undefined;
        const raw: string[] = [];
        if (settings.imageFeatured && featured) raw.push(featured);
        if (settings.imageContent) raw.push(...contentImages(blocks));
        const abs = [...new Set(raw)]
          .map((u) => absolute(u, base))
          .filter((u) => /^https?:\/\//i.test(u));
        return abs.length ? abs : undefined;
      };

      const next: SitemapEntry[] = [];
      for (const e of payload.entries) {
        if (!settings.includePages && pageByLoc.has(e.loc)) continue;
        if (!settings.includeCategories && catLocs.has(e.loc)) continue;
        if (!settings.includeTags && tagLocs.has(e.loc)) continue;
        if (excludes.some((k) => e.loc.includes(k))) continue;

        const post = postByLoc.get(e.loc);
        const page = pageByLoc.get(e.loc);
        if (post) {
          const src =
            settings.lastmodSource === "published"
              ? (post.publishedAt ?? post.updatedAt)
              : (post.updatedAt ?? post.publishedAt);
          const d = day(src);
          if (d) e.lastmod = d;
          e.changefreq = cf;
          e.priority = settings.postPriority;
          const imgs = collectImages(post.featuredImage, post.content);
          if (imgs) e.images = imgs;
        } else if (page) {
          const d = day(page.updatedAt ?? page.publishedAt);
          if (d) e.lastmod = d;
          e.changefreq = cf;
          e.priority = settings.pagePriority;
          const imgs = collectImages(page.featuredImage, page.content);
          if (imgs) e.images = imgs;
        }
        next.push(e);
      }

      // 手动追加的静态 URL，去重后按 monthly / 0.5 输出。
      const existing = new Set(next.map((e) => e.loc));
      for (const raw of lines(settings.extraUrls)) {
        const loc = absolute(raw, base);
        if (!/^https?:\/\//i.test(loc) || existing.has(loc)) continue;
        if (excludes.some((k) => loc.includes(k))) continue;
        next.push({ loc, changefreq: "monthly", priority: "0.5" });
        existing.add(loc);
      }

      payload.entries = next;
      return payload;
    });

    // ── 1.1 新增：文档级认领（新闻地图 / 分片 / 超量索引） ────────────
    addFilter<SitemapDocumentPayload>(
      HOOKS.sitemapDocument,
      async (payload) => {
        const sp = payload.searchParams;
        const XML_TYPE = "application/xml; charset=utf-8";

        // 分支 1：?kind=news —— 未开启新闻地图时保持 doc=null → 404。
        if (sp.get("kind") === "news") {
          if (settings.newsEnabled) {
            const site = await getSettings();
            const hours = Math.max(1, Number(settings.newsHours) || 48);
            const cutoff = Date.now() - hours * 3_600_000;
            const now = Date.now();
            const excludes = lines(settings.excludeKeywords);
            const items: { loc: string; date: string; title: string }[] = [];
            for (const p of payload.posts) {
              if (!p.publishedAt) continue;
              const t = p.publishedAt.getTime();
              // 定时发布的未来文章不进新闻地图；超出时间窗的也不进。
              if (t > now || t < cutoff) continue;
              const loc = `${payload.base}${p.url}`;
              if (excludes.some((k) => loc.includes(k))) continue;
              items.push({
                loc,
                date: p.publishedAt.toISOString(),
                title: p.title,
              });
            }
            // 最新的在前。
            items.sort((a, b) => b.date.localeCompare(a.date));
            payload.doc = {
              contentType: XML_TYPE,
              xml: renderNewsXml(
                items,
                settings.newsLanguage || "zh-CN",
                site.siteTitle || "OboePress",
              ),
            };
          }
          return payload;
        }

        const shards = buildShards(
          payload.entries,
          settings.shardMaxUrls,
          settings.shardMaxMb * 1024 * 1024,
        );

        // 分支 2：?part=n —— 只认领正整数；越界/非法保持 null → 404。
        const partRaw = sp.get("part");
        if (partRaw !== null) {
          if (/^[1-9]\d*$/.test(partRaw)) {
            const shard = shards[Number(partRaw) - 1];
            if (shard) {
              payload.doc = {
                contentType: XML_TYPE,
                xml: renderSitemapUrlset(shard.entries),
              };
            }
          }
          return payload;
        }

        // 分支 3：无查询参数，超量（需要多于一片）时换成 sitemapindex。
        // 未超量则原样保留核心给出的默认 urlset。
        if (shards.length > 1) {
          payload.doc = {
            contentType: XML_TYPE,
            xml: renderSitemapIndex(
              shards.map((s, i) => ({
                loc: `${payload.base}/sitemap.xml?part=${i + 1}`,
                lastmod: s.lastmod,
              })),
            ),
          };
        }
        return payload;
      },
    );

    // ── 1.1 新增：robots.txt 追加新闻地图声明 ─────────────────────────
    addFilter<RobotsPayload>(HOOKS.robotsRules, (payload) => {
      if (!settings.newsEnabled) return payload;
      // 全站 noindex 封锁模式（核心给的是 "Disallow: /"）不暴露任何地图。
      if (payload.lines.some((l) => l.trim() === "Disallow: /")) {
        return payload;
      }
      const decl = `Sitemap: ${payload.base}/sitemap.xml?kind=news`;
      if (!payload.lines.includes(decl)) payload.lines.push("", decl);
      return payload;
    });
  },
});
