import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import type { Page, ContentStatus } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { PageInput } from "@/lib/validation";
import { can } from "@/lib/rbac";
import { blocksToPlainText } from "@/lib/blocks";
import { slugify, uniqueSlug, excerptFrom } from "@/lib/utils";
import { ForbiddenError, NotFoundError } from "./errors";
import { getPermalinkConfig, pageUrlFor } from "./links";
import { getPostMetas, setPostMetas } from "./metas";

export type PageQuery = {
  status?: string;
  limit?: number;
  offset?: number;
};

export type PageListItem = Page & {
  /** Public URL under the current permalink config. */
  url: string;
  metas: Record<string, string>;
};

async function takenSlugs(base: string): Promise<Set<string>> {
  const rows = await db
    .select({ slug: pages.slug })
    .from(pages)
    .where(sql`${pages.slug} LIKE ${base + "%"}`);
  return new Set(rows.map((r) => r.slug));
}

export async function listPages(opts: PageQuery = {}): Promise<{
  items: (Page & { url: string })[];
  total: number;
}> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;
  const where = opts.status ? eq(pages.status, opts.status as ContentStatus) : undefined;

  const rows = await db
    .select()
    .from(pages)
    .where(where)
    .orderBy(desc(pages.updatedAt))
    .limit(limit)
    .offset(offset);

  const [totalRows, cfg] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(pages).where(where),
    getPermalinkConfig(),
  ]);
  return {
    items: rows.map((row) => ({ ...row, url: pageUrlFor(cfg, row) })),
    total: Number(totalRows[0]?.count ?? 0),
  };
}

export async function getPageById(id: number, includeUnpublished = false): Promise<PageListItem> {
  const [row] = await db.select().from(pages).where(eq(pages.id, id));
  if (!row) throw new NotFoundError("页面不存在");
  if (!includeUnpublished && row.status !== "published")
    throw new NotFoundError("页面不存在");
  const [metas, cfg] = await Promise.all([getPostMetas(id), getPermalinkConfig()]);
  return { ...row, url: pageUrlFor(cfg, row), metas };
}

export async function getPageBySlug(
  slug: string,
  includeUnpublished = false,
): Promise<PageListItem> {
  const [row] = await db.select().from(pages).where(eq(pages.slug, slug));
  if (!row) throw new NotFoundError("页面不存在");
  if (!includeUnpublished && row.status !== "published")
    throw new NotFoundError("页面不存在");
  const [metas, cfg] = await Promise.all([
    getPostMetas(row.id),
    getPermalinkConfig(),
  ]);
  return { ...row, url: pageUrlFor(cfg, row), metas };
}

export async function createPage(user: SessionUser, input: PageInput): Promise<PageListItem> {
  if (!can(user.role, "content:update:any"))
    throw new ForbiddenError("仅编辑/管理员可管理页面");
  const base = slugify(input.slug || input.title);
  const slug = uniqueSlug(base, await takenSlugs(base));
  const excerpt = input.excerpt || excerptFrom(blocksToPlainText(input.content));
  const [page] = await db
    .insert(pages)
    .values({
      title: input.title,
      slug,
      excerpt,
      content: input.content,
      status: input.status,
      featuredImage: input.featuredImage || null,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      seoKeywords: input.seoKeywords,
      commentStatus: input.commentStatus ?? "open",
      parentId: input.parentId ?? null,
      publishedAt: input.publishedAt
        ? new Date(input.publishedAt)
        : (input.status ?? "draft") === "published"
          ? new Date()
          : null,
    })
    .returning();
  if (input.metas) await setPostMetas(page.id, input.metas);
  return getPageById(page.id, true);
}

export async function updatePage(
  user: SessionUser,
  id: number,
  input: Partial<PageInput>,
): Promise<PageListItem> {
  if (!can(user.role, "content:update:any"))
    throw new ForbiddenError("仅编辑/管理员可管理页面");
  const existing = await getPageById(id, true);

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const base = slugify(input.slug);
    const taken = await takenSlugs(base);
    taken.delete(existing.slug);
    slug = uniqueSlug(base, taken);
  }
  let publishedAt = existing.publishedAt;
  if (input.publishedAt) publishedAt = new Date(input.publishedAt);
  else if (input.status === "published" && !existing.publishedAt)
    publishedAt = new Date();

  await db
    .update(pages)
    .set({
      title: input.title ?? existing.title,
      slug,
      excerpt:
        input.excerpt !== undefined
          ? input.excerpt ||
            excerptFrom(blocksToPlainText(input.content ?? existing.content))
          : existing.excerpt,
      content: input.content ?? existing.content,
      status: input.status ?? existing.status,
      featuredImage:
        input.featuredImage !== undefined
          ? input.featuredImage || null
          : existing.featuredImage,
      seoTitle:
        input.seoTitle !== undefined ? input.seoTitle : existing.seoTitle,
      seoDescription:
        input.seoDescription !== undefined
          ? input.seoDescription
          : existing.seoDescription,
      seoKeywords: input.seoKeywords !== undefined ? input.seoKeywords : existing.seoKeywords,
      commentStatus: input.commentStatus ?? existing.commentStatus,
      parentId: input.parentId !== undefined ? input.parentId ?? null : existing.parentId,
      publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(pages.id, id));

  if (input.metas) await setPostMetas(id, input.metas);
  return getPageById(id, true);
}

export async function deletePage(user: SessionUser, id: number): Promise<{ id: number }> {
  if (!can(user.role, "content:update:any"))
    throw new ForbiddenError("仅编辑/管理员可管理页面");
  await db.delete(pages).where(eq(pages.id, id));
  return { id };
}

/** Increment the read counter (called on each public view). */
export async function incrementViews(id: number): Promise<void> {
  await db.execute(sql`update ${pages} set views = views + 1 where id = ${id}`);
}
