import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  comments,
  postCategories,
  posts,
  postTags,
  tags,
  widgets,
  type Widget,
} from "@/db/schema";
import { applyFilters, HOOKS } from "@/lib/hooks";
import { resolveSettings } from "@/lib/settings-schema";
import { getWidgetType, WIDGET_TYPES, type WidgetTypeDef } from "@/lib/widgets/registry";
import { ensureBootstrap } from "./bootstrap";
import { ensurePluginsLoaded } from "./plugins";
import { NotFoundError, ValidationError } from "./errors";
import {
  getPermalinkConfig,
  postUrlFor,
  categoryUrlFor,
  tagUrlFor,
  type PermalinkConfig,
} from "./links";
import { publicCached, cacheKey, bump } from "./public-cache";

export type WidgetInput = {
  area: string;
  type: string;
  title?: string;
  order?: number;
  enabled?: boolean;
  config?: Record<string, unknown>;
  themeSlug?: string;
};

/** Widget types including any registered by plugins. */
export async function listWidgetTypes(): Promise<WidgetTypeDef[]> {
  await ensurePluginsLoaded();
  return applyFilters<{ widgets: WidgetTypeDef[] }>(HOOKS.widgetTypes, {
    widgets: [...WIDGET_TYPES],
  }).widgets;
}

export async function listWidgets(themeSlug?: string): Promise<Widget[]> {
  await ensureBootstrap();
  const rows = themeSlug
    ? await db
        .select()
        .from(widgets)
        .where(eq(widgets.themeSlug, themeSlug))
        .orderBy(asc(widgets.area), asc(widgets.order))
    : await db.select().from(widgets).orderBy(asc(widgets.area), asc(widgets.order));
  return rows;
}

export async function createWidget(input: WidgetInput): Promise<Widget> {
  await ensureBootstrap();
  const types = await listWidgetTypes();
  if (!types.some((t) => t.type === input.type)) {
    throw new ValidationError("未知的小工具类型");
  }
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${widgets.order}),0)` })
    .from(widgets)
    .where(and(eq(widgets.area, input.area), eq(widgets.themeSlug, input.themeSlug ?? "")));
  const [row] = await db
    .insert(widgets)
    .values({
      area: input.area,
      type: input.type,
      title: input.title ?? "",
      order: input.order ?? Number(maxRow?.max ?? 0) + 1,
      enabled: input.enabled ?? true,
      config: input.config ?? {},
      themeSlug: input.themeSlug ?? "",
    })
    .returning();
  bump("widgets");
  return row;
}

export async function updateWidget(
  id: number,
  input: Partial<WidgetInput>,
): Promise<Widget> {
  await ensureBootstrap();
  const [existing] = await db.select().from(widgets).where(eq(widgets.id, id));
  if (!existing) throw new NotFoundError("小工具不存在");
  const [row] = await db
    .update(widgets)
    .set({
      area: input.area ?? existing.area,
      title: input.title ?? existing.title,
      order: input.order ?? existing.order,
      enabled: input.enabled ?? existing.enabled,
      config: input.config ? { ...existing.config, ...input.config } : existing.config,
    })
    .where(eq(widgets.id, id))
    .returning();
  bump("widgets");
  return row;
}

export async function deleteWidget(id: number): Promise<{ id: number }> {
  await ensureBootstrap();
  await db.delete(widgets).where(eq(widgets.id, id));
  bump("widgets");
  return { id };
}

/** Persist a new ordering for one area in a single pass. */
export async function reorderWidgets(ids: number[]): Promise<void> {
  await ensureBootstrap();
  for (let i = 0; i < ids.length; i++) {
    await db.update(widgets).set({ order: i + 1 }).where(eq(widgets.id, ids[i]));
  }
  bump("widgets");
}

/* -------------------------------------------------------------------------- */
/* Public-side data resolution                                                */
/* -------------------------------------------------------------------------- */

export type ResolvedWidget = {
  id: number;
  type: string;
  title: string;
  config: Record<string, unknown>;
  data: unknown;
};

/** Load every enabled widget in an area, with its data already fetched.
 *  整组解析结果跨请求短 TTL 缓存（含每个小工具的数据查询），写小工具或内容变更时主动失效。 */
export function getAreaWidgets(themeSlug: string, area: string): Promise<ResolvedWidget[]> {
  return publicCached(cacheKey("widgets", `area:${themeSlug}:${area}`), () =>
    getAreaWidgetsUncached(themeSlug, area),
  );
}

async function getAreaWidgetsUncached(
  themeSlug: string,
  area: string,
): Promise<ResolvedWidget[]> {
  await ensureBootstrap();
  const rows = await db
    .select()
    .from(widgets)
    .where(
      and(
        eq(widgets.area, area),
        eq(widgets.enabled, true),
        eq(widgets.themeSlug, themeSlug),
      ),
    )
    .orderBy(asc(widgets.order));

  const cfg = await getPermalinkConfig();
  const out: ResolvedWidget[] = [];
  for (const w of rows) {
    const def = getWidgetType(w.type);
    const config = resolveSettings(def?.settings ?? [], w.config);
    out.push({
      id: w.id,
      type: w.type,
      title: w.title,
      config,
      data: withWidgetUrls(w.type, await resolveWidgetData(w.type, config), cfg),
    });
  }
  return out;
}

/** Attach public URLs to entity rows carried by link-producing widgets. */
function withWidgetUrls(type: string, data: unknown, cfg: PermalinkConfig): unknown {
  if (!Array.isArray(data)) return data;
  if (type === "recent-posts" || type === "popular-posts")
    return data.map((r: { id: number; slug: string }) => ({ ...r, url: postUrlFor(cfg, r) }));
  if (type === "categories")
    return data.map((r: { slug: string }) => ({ ...r, url: categoryUrlFor(cfg, r) }));
  if (type === "tag-cloud")
    return data.map((r: { slug: string }) => ({ ...r, url: tagUrlFor(cfg, r) }));
  return data;
}

async function resolveWidgetData(
  type: string,
  config: Record<string, unknown>,
): Promise<unknown> {
  const num = (k: string, d: number) => {
    const n = Number(config[k]);
    return Number.isFinite(n) && n > 0 ? n : d;
  };

  switch (type) {
    case "recent-posts": {
      const limit = num("count", 5);
      const catSlug = String(config.category ?? "").trim();
      if (catSlug) {
        const rows = await db
          .select({
            id: posts.id,
            title: posts.title,
            slug: posts.slug,
            publishedAt: posts.publishedAt,
            featuredImage: posts.featuredImage,
          })
          .from(posts)
          .innerJoin(postCategories, eq(postCategories.postId, posts.id))
          .innerJoin(categories, eq(categories.id, postCategories.categoryId))
          .where(and(eq(posts.status, "published"), eq(categories.slug, catSlug)))
          .orderBy(desc(posts.publishedAt))
          .limit(limit);
        return rows;
      }
      return db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          publishedAt: posts.publishedAt,
          featuredImage: posts.featuredImage,
        })
        .from(posts)
        .where(eq(posts.status, "published"))
        .orderBy(desc(posts.publishedAt))
        .limit(limit);
    }

    case "popular-posts":
      return db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          views: posts.views,
        })
        .from(posts)
        .where(eq(posts.status, "published"))
        .orderBy(desc(posts.views))
        .limit(num("count", 5));

    case "categories": {
      const rows = await db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          count: sql<number>`count(${postCategories.postId})`,
        })
        .from(categories)
        .leftJoin(postCategories, eq(postCategories.categoryId, categories.id))
        .groupBy(categories.id, categories.name, categories.slug)
        .orderBy(asc(categories.name));
      return config.hideEmpty ? rows.filter((r) => Number(r.count) > 0) : rows;
    }

    case "tag-cloud":
      return db
        .select({
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          count: sql<number>`count(${postTags.postId})`,
        })
        .from(tags)
        .leftJoin(postTags, eq(postTags.tagId, tags.id))
        .groupBy(tags.id, tags.name, tags.slug)
        .orderBy(desc(sql`count(${postTags.postId})`))
        .limit(num("count", 30));

    case "archive": {
      const byYear = String(config.mode ?? "month") === "year";
      const fmt = byYear ? "YYYY" : "YYYY-MM";
      const rows = await db
        .select({
          period: sql<string>`to_char(${posts.publishedAt}, ${sql.raw(`'${fmt}'`)})`,
          count: sql<number>`count(*)`,
        })
        .from(posts)
        .where(eq(posts.status, "published"))
        .groupBy(sql`to_char(${posts.publishedAt}, ${sql.raw(`'${fmt}'`)})`)
        .orderBy(desc(sql`to_char(${posts.publishedAt}, ${sql.raw(`'${fmt}'`)})`))
        .limit(num("limit", 12));
      return rows.filter((r) => !!r.period);
    }

    case "recent-comments":
      return db
        .select({
          id: comments.id,
          authorName: comments.authorName,
          content: comments.content,
          postId: comments.postId,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .where(eq(comments.status, "published"))
        .orderBy(desc(comments.createdAt))
        .limit(num("count", 5));

    case "stats": {
      const [p] = await db
        .select({
          posts: sql<number>`count(*)`,
          views: sql<number>`coalesce(sum(${posts.views}),0)`,
        })
        .from(posts)
        .where(eq(posts.status, "published"));
      const [c] = await db
        .select({ comments: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.status, "published"));
      const [t] = await db.select({ tags: sql<number>`count(*)` }).from(tags);
      const [cat] = await db
        .select({ categories: sql<number>`count(*)` })
        .from(categories);
      return {
        posts: Number(p?.posts ?? 0),
        views: Number(p?.views ?? 0),
        comments: Number(c?.comments ?? 0),
        tags: Number(t?.tags ?? 0),
        categories: Number(cat?.categories ?? 0),
      };
    }

    default:
      // text / search / profile / links need no server data.
      return null;
  }
}
