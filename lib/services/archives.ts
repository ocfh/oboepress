import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { postCategories, postTags, posts } from "@/db/schema";
import { ensureBootstrap } from "./bootstrap";
import { getPermalinkConfig, postUrlFor } from "./links";

/**
 * Archive index + related-posts queries.
 *
 * Kept out of posts.ts because both are read-only aggregate views that the
 * public site needs but the editor never touches.
 */

export type ArchiveMonth = {
  year: number;
  month: number;
  count: number;
  label: string;
};

export type ArchiveYear = {
  year: number;
  count: number;
  months: ArchiveMonth[];
};

/** Every published post grouped by year → month, newest first. */
export async function getArchiveIndex(): Promise<ArchiveYear[]> {
  await ensureBootstrap();
  const rows = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${posts.publishedAt})::int`,
      month: sql<number>`EXTRACT(MONTH FROM ${posts.publishedAt})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(posts)
    .where(and(eq(posts.status, "published"), sql`${posts.publishedAt} IS NOT NULL`))
    .groupBy(
      sql`EXTRACT(YEAR FROM ${posts.publishedAt})`,
      sql`EXTRACT(MONTH FROM ${posts.publishedAt})`,
    )
    .orderBy(
      desc(sql`EXTRACT(YEAR FROM ${posts.publishedAt})`),
      desc(sql`EXTRACT(MONTH FROM ${posts.publishedAt})`),
    );

  const years = new Map<number, ArchiveYear>();
  for (const r of rows) {
    const y = Number(r.year);
    const m = Number(r.month);
    const c = Number(r.count);
    if (!years.has(y)) years.set(y, { year: y, count: 0, months: [] });
    const entry = years.get(y)!;
    entry.count += c;
    entry.months.push({ year: y, month: m, count: c, label: `${y} 年 ${m} 月` });
  }
  return [...years.values()];
}

/** Total published posts — handy for the archive page header. */
export async function getPublishedCount(): Promise<number> {
  await ensureBootstrap();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.status, "published"));
  return Number(row?.count ?? 0);
}

export type ArchiveEntry = {
  id: number;
  title: string;
  slug: string;
  publishedAt: Date | null;
  format: string;
  views: number;
  /** Public URL under the current permalink config. */
  url: string;
};

/** Flat list of every published post, newest first — the /archives timeline. */
export async function listArchiveEntries(opts: {
  year?: number;
  month?: number;
  limit?: number;
} = {}): Promise<ArchiveEntry[]> {
  await ensureBootstrap();
  const conditions = [eq(posts.status, "published")];
  if (opts.year) conditions.push(sql`EXTRACT(YEAR FROM ${posts.publishedAt}) = ${opts.year}`);
  if (opts.month) conditions.push(sql`EXTRACT(MONTH FROM ${posts.publishedAt}) = ${opts.month}`);

  const [rows, cfg] = await Promise.all([
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        publishedAt: posts.publishedAt,
        format: posts.format,
        views: posts.views,
      })
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.publishedAt))
      .limit(Math.min(opts.limit ?? 2000, 5000)),
    getPermalinkConfig(),
  ]);
  return rows.map((p) => ({ ...p, url: postUrlFor(cfg, p) }));
}

/**
 * Related posts, ranked by shared taxonomy terms.
 *
 * Scoring: every shared tag is worth 2, every shared category 3 (categories are
 * a stronger signal than tags). Ties break on recency. Falls back to the latest
 * posts when a post has no terms at all, so the section is never empty.
 */
export type RelatedPost = {
  id: number;
  title: string;
  slug: string;
  publishedAt: Date | null;
  featuredImage: string | null;
  score: number;
  /** Public URL under the current permalink config. */
  url: string;
};

export async function getRelatedPosts(
  postId: number,
  limit = 4,
): Promise<RelatedPost[]> {
  await ensureBootstrap();

  const [catRows, tagRows, cfg] = await Promise.all([
    db
      .select({ id: postCategories.categoryId })
      .from(postCategories)
      .where(eq(postCategories.postId, postId)),
    db.select({ id: postTags.tagId }).from(postTags).where(eq(postTags.postId, postId)),
    getPermalinkConfig(),
  ]);
  const catIds = catRows.map((r) => r.id);
  const tagIds = tagRows.map((r) => r.id);

  if (!catIds.length && !tagIds.length) {
    const fallback = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        publishedAt: posts.publishedAt,
        featuredImage: posts.featuredImage,
      })
      .from(posts)
      .where(and(eq(posts.status, "published"), sql`${posts.id} <> ${postId}`))
      .orderBy(desc(posts.publishedAt))
      .limit(limit);
    return fallback.map((p) => ({ ...p, score: 0, url: postUrlFor(cfg, p) }));
  }

  // Two cheap membership queries beat one giant join for a handful of terms.
  const [byCat, byTag] = await Promise.all([
    catIds.length
      ? db
          .select({ postId: postCategories.postId })
          .from(postCategories)
          .where(inArray(postCategories.categoryId, catIds))
      : Promise.resolve([] as { postId: number }[]),
    tagIds.length
      ? db
          .select({ postId: postTags.postId })
          .from(postTags)
          .where(inArray(postTags.tagId, tagIds))
      : Promise.resolve([] as { postId: number }[]),
  ]);

  const score = new Map<number, number>();
  for (const r of byCat) {
    if (r.postId === postId) continue;
    score.set(r.postId, (score.get(r.postId) ?? 0) + 3);
  }
  for (const r of byTag) {
    if (r.postId === postId) continue;
    score.set(r.postId, (score.get(r.postId) ?? 0) + 2);
  }
  if (!score.size) return getRelatedPosts(-1, limit).then((r) => r.slice(0, limit));

  const candidateIds = [...score.keys()];
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
      featuredImage: posts.featuredImage,
    })
    .from(posts)
    .where(and(eq(posts.status, "published"), inArray(posts.id, candidateIds)));

  return rows
    .map((p) => ({ ...p, score: score.get(p.id) ?? 0, url: postUrlFor(cfg, p) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, limit);
}
