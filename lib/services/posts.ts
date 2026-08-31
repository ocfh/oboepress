import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  postCategories,
  postTags,
  posts,
  tags,
  users,
} from "@/db/schema";
import type { Post, ContentStatus, PostFormat } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { PostInput } from "@/lib/validation";
import { blocksToPlainText } from "@/lib/blocks";
import { canModifyContent } from "@/lib/rbac";
import { slugify, uniqueSlug, excerptFrom } from "@/lib/utils";
import { ForbiddenError, NotFoundError } from "./errors";
import { getPostMetas, setPostMetas } from "./metas";

export type PostListItem = Post & {
  author: { id: number; name: string; email: string } | null;
  categories: { id: number; name: string; slug: string }[];
  tags: { id: number; name: string; slug: string }[];
  metas: Record<string, string>;
};

export type PostQuery = {
  status?: string;
  authorId?: number;
  categoryId?: number;
  tagId?: number;
  categorySlug?: string;
  tagSlug?: string;
  search?: string;
  /** Post format filter: "standard" | "aside" | "quote" | … */
  format?: string;
  /** Archive filters — 4-digit year and optional 1-12 month. */
  year?: number;
  month?: number;
  /** Sticky posts float to the top of the first page (WordPress behaviour). */
  pinnedFirst?: boolean;
  /** Exclude one post id — used by "related posts". */
  excludeId?: number;
  limit?: number;
  offset?: number;
};

async function takenSlugs(base: string): Promise<Set<string>> {
  const rows = await db
    .select({ slug: posts.slug })
    .from(posts)
    .where(sql`${posts.slug} LIKE ${base + "%"}`);
  return new Set(rows.map((r) => r.slug));
}

async function attachTaxonomies(ids: number[]): Promise<{
  categories: Record<number, { id: number; name: string; slug: string }[]>;
  tags: Record<number, { id: number; name: string; slug: string }[]>;
}> {
  const cats: Record<number, { id: number; name: string; slug: string }[]> = {};
  const tg: Record<number, { id: number; name: string; slug: string }[]> = {};
  if (ids.length === 0) return { categories: cats, tags: tg };

  const ct = await db
    .select({
      postId: postCategories.postId,
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
    })
    .from(postCategories)
    .innerJoin(categories, eq(postCategories.categoryId, categories.id))
    .where(inArray(postCategories.postId, ids));

  const tt = await db
    .select({
      postId: postTags.postId,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, ids));

  for (const row of ct) (cats[row.postId] ??= []).push(row);
  for (const row of tt) (tg[row.postId] ??= []).push(row);
  return { categories: cats, tags: tg };
}

export async function listPosts(opts: PostQuery = {}): Promise<{
  items: PostListItem[];
  total: number;
}> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  const conditions = [];
  if (opts.status) conditions.push(eq(posts.status, opts.status as ContentStatus));
  if (opts.authorId) conditions.push(eq(posts.authorId, opts.authorId));
  if (opts.categoryId)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${postCategories} pc WHERE pc.post_id = ${posts.id} AND pc.category_id = ${opts.categoryId})`,
    );
  if (opts.categorySlug)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${postCategories} pc JOIN ${categories} c ON c.id = pc.category_id WHERE pc.post_id = ${posts.id} AND c.slug = ${opts.categorySlug})`,
    );
  if (opts.tagId)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${postTags} pt WHERE pt.post_id = ${posts.id} AND pt.tag_id = ${opts.tagId})`,
    );
  if (opts.tagSlug)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${postTags} pt JOIN ${tags} t ON t.id = pt.tag_id WHERE pt.post_id = ${posts.id} AND t.slug = ${opts.tagSlug})`,
    );
  if (opts.search)
    conditions.push(
      sql`(${posts.title} ILIKE ${"%" + opts.search + "%"} OR ${posts.excerpt} ILIKE ${
        "%" + opts.search + "%"
      })`,
    );
  if (opts.format) conditions.push(eq(posts.format, opts.format as PostFormat));
  if (opts.year)
    conditions.push(
      sql`EXTRACT(YEAR FROM ${posts.publishedAt}) = ${opts.year}`,
    );
  if (opts.month)
    conditions.push(
      sql`EXTRACT(MONTH FROM ${posts.publishedAt}) = ${opts.month}`,
    );
  if (opts.excludeId) conditions.push(sql`${posts.id} <> ${opts.excludeId}`);
  const where = conditions.length ? and(...conditions) : undefined;

  // Sticky posts only make sense on the first page of a listing.
  const order = opts.pinnedFirst
    ? [desc(posts.pinned), desc(posts.publishedAt), desc(posts.createdAt)]
    : [desc(posts.publishedAt), desc(posts.createdAt)];

  const rows = await db
    .select({
      post: posts,
      authorName: users.name,
      authorEmail: users.email,
      authorId: users.id,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const ids = rows.map((r) => r.post.id);
  const tax = await attachTaxonomies(ids);
  const metaMap = await attachMetas(ids);

  const items: PostListItem[] = rows.map((r) => ({
    ...r.post,
    author: r.authorId
      ? { id: r.authorId, name: r.authorName!, email: r.authorEmail! }
      : null,
    categories: tax.categories[r.post.id] ?? [],
    tags: tax.tags[r.post.id] ?? [],
    metas: metaMap[r.post.id] ?? {},
  }));

  return { items, total };
}

async function attachMetas(ids: number[]): Promise<Record<number, Record<string, string>>> {
  const out: Record<number, Record<string, string>> = {};
  if (ids.length === 0) return out;
  const { postMetas } = await import("@/db/schema");
  const rows = await db.select().from(postMetas).where(inArray(postMetas.postId, ids));
  for (const r of rows) (out[r.postId] ??= {})[r.key] = r.value ?? "";
  return out;
}

export async function getPostById(
  id: number,
  includeUnpublished = false,
): Promise<PostListItem> {
  const [row] = await db
    .select({
      post: posts,
      authorName: users.name,
      authorEmail: users.email,
      authorId: users.id,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, id));

  if (!row) throw new NotFoundError("文章不存在");
  if (!includeUnpublished && row.post.status !== "published")
    throw new NotFoundError("文章不存在");

  const tax = await attachTaxonomies([id]);
  const metas = await getPostMetas(id);
  return {
    ...row.post,
    author: row.authorId
      ? { id: row.authorId, name: row.authorName!, email: row.authorEmail! }
      : null,
    categories: tax.categories[id] ?? [],
    tags: tax.tags[id] ?? [],
    metas,
  };
}

export async function getPostBySlug(
  slug: string,
  includeUnpublished = false,
): Promise<PostListItem> {
  const [row] = await db
    .select({
      post: posts,
      authorName: users.name,
      authorEmail: users.email,
      authorId: users.id,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.slug, slug));

  if (!row) throw new NotFoundError("文章不存在");
  if (!includeUnpublished && row.post.status !== "published")
    throw new NotFoundError("文章不存在");

  const tax = await attachTaxonomies([row.post.id]);
  const metas = await getPostMetas(row.post.id);
  return {
    ...row.post,
    author: row.authorId
      ? { id: row.authorId, name: row.authorName!, email: row.authorEmail! }
      : null,
    categories: tax.categories[row.post.id] ?? [],
    tags: tax.tags[row.post.id] ?? [],
    metas,
  };
}

async function setTaxonomies(
  postId: number,
  categoryIds: number[],
  tagIds: number[],
) {
  await db.delete(postCategories).where(eq(postCategories.postId, postId));
  await db.delete(postTags).where(eq(postTags.postId, postId));
  if (categoryIds.length)
    await db
      .insert(postCategories)
      .values(categoryIds.map((categoryId) => ({ postId, categoryId })));
  if (tagIds.length)
    await db.insert(postTags).values(tagIds.map((tagId) => ({ postId, tagId })));
}

export async function createPost(user: SessionUser, input: PostInput) {
  const slugBase = slugify(input.slug || input.title);
  const slug = uniqueSlug(slugBase, await takenSlugs(slugBase));
  const authorId =
    (user.role === "admin" || user.role === "editor") && input.authorId
      ? input.authorId
      : user.id;
  const excerpt = input.excerpt || excerptFrom(blocksToPlainText(input.content));

  const [post] = await db
    .insert(posts)
    .values({
      title: input.title,
      slug,
      excerpt,
      content: input.content,
      status: input.status ?? "draft",
      featuredImage: input.featuredImage || null,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      commentStatus: input.commentStatus ?? "open",
      authorId,
      publishedAt: (input.status ?? "draft") === "published" ? new Date() : null,
      format: input.format ?? "standard",
      formatMeta: input.formatMeta ?? {},
      pinned: input.pinned ?? false,
      template: input.template ?? null,
    })
    .returning();

  await setTaxonomies(post.id, input.categoryIds, input.tagIds);
  if (input.metas) await setPostMetas(post.id, input.metas);
  return getPostById(post.id, true);
}

export async function updatePost(
  user: SessionUser,
  id: number,
  input: Partial<PostInput>,
) {
  const existing = await getPostById(id, true);
  if (!canModifyContent(user.role, existing.authorId, user.id))
    throw new ForbiddenError();

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const base = slugify(input.slug);
    const taken = await takenSlugs(base);
    taken.delete(existing.slug);
    slug = uniqueSlug(base, taken);
  }

  // recompute publishedAt if transitioning to published
  let publishedAt = existing.publishedAt;
  if (input.status === "published" && !existing.publishedAt)
    publishedAt = new Date();

  await db
    .update(posts)
    .set({
      title: input.title ?? existing.title,
      slug,
      excerpt:
        input.excerpt !== undefined
          ? input.excerpt || excerptFrom(blocksToPlainText(input.content ?? existing.content))
          : existing.excerpt,
      content: input.content ?? existing.content,
      status: input.status ?? existing.status,
      featuredImage:
        input.featuredImage !== undefined ? input.featuredImage || null : existing.featuredImage,
      seoTitle: input.seoTitle !== undefined ? input.seoTitle : existing.seoTitle,
      seoDescription:
        input.seoDescription !== undefined ? input.seoDescription : existing.seoDescription,
      commentStatus: input.commentStatus ?? existing.commentStatus,
      publishedAt,
      format: input.format ?? existing.format,
      formatMeta: input.formatMeta !== undefined ? input.formatMeta : existing.formatMeta,
      pinned: input.pinned !== undefined ? input.pinned : existing.pinned,
      template: input.template !== undefined ? input.template ?? null : existing.template,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  if (input.categoryIds || input.tagIds)
    await setTaxonomies(id, input.categoryIds ?? [], input.tagIds ?? []);
  if (input.metas) await setPostMetas(id, input.metas);

  return getPostById(id, true);
}

export async function deletePost(user: SessionUser, id: number) {
  const existing = await getPostById(id, true);
  if (!canModifyContent(user.role, existing.authorId, user.id))
    throw new ForbiddenError();
  await db.delete(posts).where(eq(posts.id, id));
  return { id };
}

/** Increment the read counter (called on each public view). */
export async function incrementViews(id: number): Promise<void> {
  await db.execute(sql`update ${posts} set views = views + 1 where id = ${id}`);
}
