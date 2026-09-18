import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { applyFilters, HOOKS } from "@/lib/hooks";
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
import { pinyinSlug } from "@/lib/pinyin";
import { getPermalinkConfig, postUrlFor, categoryUrlFor, tagUrlFor } from "./links";
import { ForbiddenError, NotFoundError } from "./errors";
import { getPostMetas, setPostMetas } from "./metas";
import { ensurePluginsLoaded } from "./plugins";

export type PostListItem = Post & {
  /** Public URL under the current permalink config. */
  url: string;
  author: { id: number; name: string; email: string } | null;
  categories: { id: number; name: string; slug: string; url: string }[];
  tags: { id: number; name: string; slug: string; url: string }[];
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
  /**
   * Set false to opt out of plugin-contributed floating posts (feeds,
   * sitemaps keep strict chronological order). Default: floating applies to
   * every public published listing.
   */
  pinned?: boolean;
  /** Exclude one post id — used by "related posts". */
  excludeId?: number;
  /** Sort order: "date" (default) or "views" for most-read lists. */
  orderBy?: "date" | "views";
  /** Random order — used by theme "random posts" widgets. */
  random?: boolean;
  limit?: number;
  offset?: number;
};

async function takenValues(col: AnyPgColumn, base: string): Promise<Set<string>> {
  const rows = await db
    .select({ v: col })
    .from(posts)
    .where(sql`${col} LIKE ${base + "%"}`);
  // AnyPgColumn 让 select 推断出 never，这里按实际字符串列显式收窄。
  return new Set(
    (rows as { v: string | null }[])
      .map((r) => r.v)
      .filter((v): v is string => Boolean(v)),
  );
}

const takenSlugs = (base: string) => takenValues(posts.slug, base);

/**
 * Unique pinyin / initials link tails for a title. `exclude` removes the
 * post's own current values so an update keeps its tail when possible.
 */
async function uniqueLinkTails(
  title: string,
  exclude: { pinyin?: string | null; initial?: string | null } = {},
): Promise<{ pinyinSlug: string; initialSlug: string }> {
  const pyBase = pinyinSlug(title, "full");
  const iniBase = pinyinSlug(title, "initial");
  const pyTaken = await takenValues(posts.pinyinSlug, pyBase);
  const iniTaken = await takenValues(posts.initialSlug, iniBase);
  if (exclude.pinyin) pyTaken.delete(exclude.pinyin);
  if (exclude.initial) iniTaken.delete(exclude.initial);
  return {
    pinyinSlug: uniqueSlug(pyBase, pyTaken),
    initialSlug: uniqueSlug(iniBase, iniTaken),
  };
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

  // --- Plugin-contributed floating (sticky) posts ---------------------------
  // The sticky-posts plugin supplies an ordered id list via "posts.pinned".
  // Float on public listings only: never for random/search/related lists or
  // when the caller opts out (RSS feeds, sitemaps stay chronological).
  let floatingIds: number[] = [];
  if (
    opts.status === "published" &&
    opts.pinned !== false &&
    !opts.random &&
    !opts.search &&
    !opts.excludeId
  ) {
    // Every public list goes through this branch, so this is the single
    // guaranteed point where sticky-contributing plugins are registered.
    await ensurePluginsLoaded();
    const pinned = applyFilters(HOOKS.postsPinned, {
      query: opts,
      ids: [] as number[],
    });
    const wanted = pinned.ids.filter((n) => Number.isInteger(n) && n > 0);
    if (wanted.length) {
      // Keep only ids that satisfy this archive's own filters (category/tag/…).
      const valid = await db
        .select({ id: posts.id })
        .from(posts)
        .where(where ? and(where, inArray(posts.id, wanted)) : inArray(posts.id, wanted));
      const validSet = new Set(valid.map((r) => r.id));
      floatingIds = wanted.filter((id) => validSet.has(id));
    }
  }
  const normalWhere = floatingIds.length
    ? where
      ? and(where, notInArray(posts.id, floatingIds))
      : notInArray(posts.id, floatingIds)
    : where;

  const order = opts.random
    ? [sql`random()`]
    : opts.orderBy === "views"
      ? [desc(posts.views), desc(posts.publishedAt)]
      : opts.pinnedFirst
        ? [desc(posts.pinned), desc(posts.publishedAt), desc(posts.createdAt)]
        : [desc(posts.publishedAt), desc(posts.createdAt)];

  const rowShape = {
    post: posts,
    authorName: users.name,
    authorEmail: users.email,
    authorId: users.id,
  };
  type JoinedRow = {
    post: Post;
    authorName: string | null;
    authorEmail: string | null;
    authorId: number | null;
  };

  // First page: pull floating posts in the plugin-defined order.
  let pinnedRows: JoinedRow[] = [];
  let normalLimit = limit;
  let normalOffset = offset;
  if (floatingIds.length) {
    if (offset === 0) {
      const want = floatingIds.slice(0, limit);
      const found = await db
        .select(rowShape)
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(inArray(posts.id, want));
      const byId = new Map(found.map((r) => [r.post.id, r]));
      pinnedRows = want
        .map((id) => byId.get(id))
        .filter((r): r is JoinedRow => Boolean(r));
      normalLimit = limit - pinnedRows.length;
    } else {
      // The floating block consumed slots on page one — shift later pages back.
      normalOffset = Math.max(0, offset - floatingIds.length);
    }
  }

  const normalRows: JoinedRow[] =
    normalLimit > 0
      ? await db
          .select(rowShape)
          .from(posts)
          .leftJoin(users, eq(posts.authorId, users.id))
          .where(normalWhere)
          .orderBy(...order)
          .limit(normalLimit)
          .offset(normalOffset)
      : [];

  const rows = pinnedRows.concat(normalRows);

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const ids = rows.map((r) => r.post.id);
  const [tax, metaMap, cfg] = await Promise.all([
    attachTaxonomies(ids),
    attachMetas(ids),
    getPermalinkConfig(),
  ]);

  const items: PostListItem[] = rows.map((r) => ({
    ...r.post,
    url: postUrlFor(cfg, r.post),
    author: r.authorId
      ? { id: r.authorId, name: r.authorName!, email: r.authorEmail! }
      : null,
    categories: (tax.categories[r.post.id] ?? []).map((c) => ({ ...c, url: categoryUrlFor(cfg, c) })),
    tags: (tax.tags[r.post.id] ?? []).map((t) => ({ ...t, url: tagUrlFor(cfg, t) })),
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

  const [tax, metas, cfg] = await Promise.all([
    attachTaxonomies([id]),
    getPostMetas(id),
    getPermalinkConfig(),
  ]);
  return {
    ...row.post,
    url: postUrlFor(cfg, row.post),
    author: row.authorId
      ? { id: row.authorId, name: row.authorName!, email: row.authorEmail! }
      : null,
    categories: (tax.categories[id] ?? []).map((c) => ({ ...c, url: categoryUrlFor(cfg, c) })),
    tags: (tax.tags[id] ?? []).map((t) => ({ ...t, url: tagUrlFor(cfg, t) })),
    metas,
  };
}

export function getPostBySlug(slug: string, includeUnpublished = false) {
  return getPostByColumn(posts.slug, slug, includeUnpublished);
}

/** Reverse-lookup by a persisted pinyin tail (postMode "pinyin"). */
export function getPostByPinyin(value: string, includeUnpublished = false) {
  return getPostByColumn(posts.pinyinSlug, value, includeUnpublished);
}

/** Reverse-lookup by a persisted pinyin-initials tail (postMode "initial"). */
export function getPostByInitial(value: string, includeUnpublished = false) {
  return getPostByColumn(posts.initialSlug, value, includeUnpublished);
}

async function getPostByColumn(
  col: AnyPgColumn,
  value: string,
  includeUnpublished: boolean,
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
    .where(eq(col, value));

  if (!row) throw new NotFoundError("文章不存在");
  if (!includeUnpublished && row.post.status !== "published")
    throw new NotFoundError("文章不存在");

  const [tax, metas, cfg] = await Promise.all([
    attachTaxonomies([row.post.id]),
    getPostMetas(row.post.id),
    getPermalinkConfig(),
  ]);
  return {
    ...row.post,
    url: postUrlFor(cfg, row.post),
    author: row.authorId
      ? { id: row.authorId, name: row.authorName!, email: row.authorEmail! }
      : null,
    categories: (tax.categories[row.post.id] ?? []).map((c) => ({ ...c, url: categoryUrlFor(cfg, c) })),
    tags: (tax.tags[row.post.id] ?? []).map((t) => ({ ...t, url: tagUrlFor(cfg, t) })),
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
  const tails = await uniqueLinkTails(input.title);
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
      pinyinSlug: tails.pinyinSlug,
      initialSlug: tails.initialSlug,
      excerpt,
      content: input.content,
      status: input.status ?? "draft",
      featuredImage: input.featuredImage || null,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      commentStatus: input.commentStatus ?? "open",
      authorId,
      publishedAt: input.publishedAt
        ? new Date(input.publishedAt)
        : (input.status ?? "draft") === "published"
          ? new Date()
          : null,
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

  // Pinyin tails track the title; also repair NULL tails on pre-0012 rows.
  const title = input.title ?? existing.title;
  let tails: { pinyinSlug?: string; initialSlug?: string } = {};
  if (
    (input.title && input.title !== existing.title) ||
    !existing.pinyinSlug ||
    !existing.initialSlug
  ) {
    tails = await uniqueLinkTails(title, {
      pinyin: existing.pinyinSlug,
      initial: existing.initialSlug,
    });
  }

  // recompute publishedAt if transitioning to published, or the caller passes one explicitly
  let publishedAt = existing.publishedAt;
  if (input.publishedAt) publishedAt = new Date(input.publishedAt);
  else if (input.status === "published" && !existing.publishedAt)
    publishedAt = new Date();

  await db
    .update(posts)
    .set({
      title,
      slug,
      ...tails,
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

/**
 * One-time repair for rows written before migration 0012 (NULL pinyin tails).
 * Called when permalink settings are saved, so switching the post-link mode
 * to pinyin/initials makes every existing post resolvable immediately.
 * Returns the number of repaired posts.
 */
export async function backfillPostLinkSlugs(): Promise<number> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      pinyinSlug: posts.pinyinSlug,
      initialSlug: posts.initialSlug,
    })
    .from(posts);
  const missing = rows.filter((r) => !r.pinyinSlug || !r.initialSlug);
  if (!missing.length) return 0;

  const pyUsed = new Set(rows.map((r) => r.pinyinSlug).filter((v): v is string => Boolean(v)));
  const iniUsed = new Set(
    rows.map((r) => r.initialSlug).filter((v): v is string => Boolean(v)),
  );

  let repaired = 0;
  for (const r of missing) {
    const set: { pinyinSlug?: string; initialSlug?: string } = {};
    if (!r.pinyinSlug) {
      const v = uniqueSlug(pinyinSlug(r.title, "full"), pyUsed);
      pyUsed.add(v);
      set.pinyinSlug = v;
    }
    if (!r.initialSlug) {
      const v = uniqueSlug(pinyinSlug(r.title, "initial"), iniUsed);
      iniUsed.add(v);
      set.initialSlug = v;
    }
    await db.update(posts).set(set).where(eq(posts.id, r.id));
    repaired++;
  }
  return repaired;
}

/** Increment the like counter; returns the new total. */
export async function likePost(id: number): Promise<number> {
  const [row] = await db
    .update(posts)
    .set({ likes: sql`likes + 1` })
    .where(eq(posts.id, id))
    .returning({ likes: posts.likes });
  if (!row) throw new NotFoundError("文章不存在");
  return row.likes;
}
