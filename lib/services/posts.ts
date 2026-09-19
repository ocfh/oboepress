import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { applyFilters, doAction, HOOKS } from "@/lib/hooks";
import {
  categories,
  postCategories,
  postTags,
  postVisitors,
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
import { publicCached, cacheKey, bump } from "./public-cache";

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
  /** Sort order: "date" (default), "views" most-read, "likes"/"comments" for theme ranking boards. */
  orderBy?: "date" | "views" | "likes" | "comments";
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

/**
 * 公开文章列表。仅对「已发布、非随机、非搜索」形态做跨请求短 TTL 缓存：
 * 后台列表（无 status 或 draft 等）、随机文章、搜索一律实时查库。
 * 同请求内的重复调用（metadata/页面、首屏多区块）再由 React cache 合并。
 */
export function listPosts(opts: PostQuery = {}): Promise<{
  items: PostListItem[];
  total: number;
}> {
  if (opts.status === "published" && !opts.random && !opts.search) {
    return publicCached(cacheKey("posts", `list:${JSON.stringify(opts)}`), () =>
      listPostsUncached(opts),
    );
  }
  return listPostsUncached(opts);
}

async function listPostsUncached(opts: PostQuery): Promise<{
  items: PostListItem[];
  total: number;
}> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  // 每个前台列表请求都顺手触发一次到点定时发布翻转（内部 60s 节流）。
  await sweepDuePosts();

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
      : // 排行榜三榜：赞数 / 评论数优先，发布时间兜底并列
        opts.orderBy === "likes"
        ? [desc(posts.likes), desc(posts.publishedAt)]
        : opts.orderBy === "comments"
          ? [desc(posts.commentsCount), desc(posts.publishedAt)]
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

  // The merged stream is [floating posts in plugin order] followed by
  // [normal posts under the archive order]. Slice it generically so a pinned
  // set larger than one page keeps flowing onto later pages instead of the
  // overflow ids being excluded everywhere (every pinned id appears exactly
  // once; normal rows always exclude the whole floating set).
  let pinnedRows: JoinedRow[] = [];
  let normalLimit = limit;
  let normalOffset = offset;
  if (floatingIds.length) {
    const floatStart = offset;
    const floatEnd = Math.min(floatingIds.length, offset + limit);
    if (floatEnd > floatStart) {
      const want = floatingIds.slice(floatStart, floatEnd);
      const found = await db
        .select(rowShape)
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(inArray(posts.id, want));
      const byId = new Map(found.map((r) => [r.post.id, r]));
      pinnedRows = want
        .map((id) => byId.get(id))
        .filter((r): r is JoinedRow => Boolean(r));
    }
    normalLimit = limit - pinnedRows.length;
    normalOffset = Math.max(0, offset - floatingIds.length);
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

export function getPostById(
  id: number,
  includeUnpublished = false,
): Promise<PostListItem> {
  // 后台/预览取未发布内容时旁路缓存；公开读取跨请求短 TTL 复用。
  if (includeUnpublished) return getPostByIdUncached(id, true);
  return publicCached(cacheKey("posts", `get:id:${id}`), () =>
    getPostByIdUncached(id, false),
  );
}

async function getPostByIdUncached(
  id: number,
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
    .where(eq(posts.id, id));

  if (!row) throw new NotFoundError("文章不存在");
  if (!includeUnpublished && !(await flipIfDue(row.post)))
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

// 公开按列读取统一入口：未发布旁路，其余走跨请求短 TTL 缓存。
// col.name 作为键前缀（id/slug/pinyinSlug/initialSlug 互不冲突）。
function getPostByColumn(
  col: AnyPgColumn,
  value: string,
  includeUnpublished: boolean,
): Promise<PostListItem> {
  if (includeUnpublished) return getPostByColumnUncached(col, value, true);
  return publicCached(cacheKey("posts", `get:${col.name}:${value}`), () =>
    getPostByColumnUncached(col, value, false),
  );
}

async function getPostByColumnUncached(
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
  if (!includeUnpublished && !(await flipIfDue(row.post)))
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
      seoKeywords: input.seoKeywords,
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

  const saved = await getPostById(post.id, true);
  if (saved) {
    await ensurePluginsLoaded();
    doAction(HOOKS.postSaved, { post: saved });
    // 定时发布（published 但 publishedAt 在未来）不算首次发布，到点翻转时再触发。
    if (saved.status === "published" && isLive(saved)) doAction(HOOKS.postPublished, { post: saved });
  }
  return saved;
}

/** 文章当前是否已真正公开发布（状态为 published 且发布时间已到）。 */
function isLive(p: { status: string; publishedAt: Date | null }): boolean {
  return p.status === "published" && (!p.publishedAt || p.publishedAt.getTime() <= Date.now());
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
      seoKeywords: input.seoKeywords !== undefined ? input.seoKeywords : existing.seoKeywords,
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

  const saved = await getPostById(id, true);
  if (saved) {
    await ensurePluginsLoaded();
    doAction(HOOKS.postSaved, { post: saved });
    // 仅在「未发布 → 已发布」的跳变瞬间触发一次（含定时到点后的首次保存）。
    if (!isLive(existing) && isLive(saved)) doAction(HOOKS.postPublished, { post: saved });
  }
  return saved;
}

export async function deletePost(user: SessionUser, id: number) {
  const existing = await getPostById(id, true);
  if (!canModifyContent(user.role, existing.authorId, user.id))
    throw new ForbiddenError();
  await db.delete(posts).where(eq(posts.id, id));
  // 删除不经过 postSaved 钩子，直接失效公开缓存（列表/归档/小工具）。
  bump("posts");
  bump("archive");
  bump("widgets");
  return { id };
}

/**
 * 批量修改文章状态。逐条复用既有所有权规则（作者仅自己、编辑/管理员任意），
 * 无权限的 id 静默跳过；返回实际更新条数。发布跳变照常触发 postPublished。
 */
export async function bulkUpdateStatus(
  user: SessionUser,
  ids: number[],
  status: ContentStatus,
): Promise<{ updated: number }> {
  const rows = await db.select().from(posts).where(inArray(posts.id, ids));
  const allowed = rows.filter((p) =>
    canModifyContent(user.role, p.authorId, user.id),
  );
  if (!allowed.length) return { updated: 0 };
  const allowedIds = allowed.map((p) => p.id);

  await db
    .update(posts)
    .set(
      status === "published"
        ? {
            status,
            // 草稿直接发布时补当前时间，已有发布时间（含定时时间）保持不变。
            publishedAt: sql`COALESCE(${posts.publishedAt}, now())`,
            updatedAt: new Date(),
          }
        : { status, updatedAt: new Date() },
    )
    .where(inArray(posts.id, allowedIds));

  await ensurePluginsLoaded();
  for (const existing of allowed) {
    const saved = await getPostById(existing.id, true);
    if (!saved) continue;
    doAction(HOOKS.postSaved, { post: saved });
    if (!isLive(existing) && isLive(saved)) doAction(HOOKS.postPublished, { post: saved });
  }
  return { updated: allowedIds.length };
}

/** 批量删除文章，所有权规则同 bulkUpdateStatus；返回实际删除条数。 */
export async function bulkDelete(
  user: SessionUser,
  ids: number[],
): Promise<{ deleted: number }> {
  const rows = await db
    .select({ id: posts.id, authorId: posts.authorId })
    .from(posts)
    .where(inArray(posts.id, ids));
  const allowedIds = rows
    .filter((p) => canModifyContent(user.role, p.authorId, user.id))
    .map((p) => p.id);
  if (!allowedIds.length) return { deleted: 0 };
  await db.delete(posts).where(inArray(posts.id, allowedIds));
  // 批量删除同样不发钩子，直接失效。
  bump("posts");
  bump("archive");
  bump("widgets");
  return { deleted: allowedIds.length };
}

/**
 * 定时发布：请求驱动的懒翻转扫描。定时文章以 status=draft + 未来 publishedAt
 * 保存，前台天然不可见；扫描把到点文章翻成 published 并触发 post.published。
 * 进程内 60 秒最多扫描一次，无需定时任务/常驻进程。
 */
let lastDueSweep = 0;
export async function sweepDuePosts(): Promise<void> {
  const now = Date.now();
  if (now - lastDueSweep < 60_000) return;
  lastDueSweep = now;
  try {
    const due = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.status, "draft"),
          sql`${posts.publishedAt} is not null`,
          sql`${posts.publishedAt} <= now()`,
        ),
      )
      .limit(50);
    if (!due.length) return;
    const ids = due.map((r) => r.id);
    await db
      .update(posts)
      .set({ status: "published", updatedAt: new Date() })
      .where(inArray(posts.id, ids));
    await ensurePluginsLoaded();
    for (const id of ids) {
      const post = await getPostById(id, true);
      if (post) doAction(HOOKS.postPublished, { post });
    }
  } catch (e) {
    console.error("[posts] 定时发布扫描失败：", e);
  }
}

/**
 * 公开读取命中草稿时：若发布时间已到（定时文章），用条件 UPDATE 即时翻转。
 * 仅在直接访问到草稿的罕见路径触发，普通已发布文章零额外查询。
 */
async function flipIfDue(p: Post): Promise<boolean> {
  if (p.status === "published") return true;
  if (!p.publishedAt || p.publishedAt.getTime() > Date.now()) return false;
  const flipped = await db
    .update(posts)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(eq(posts.id, p.id), eq(posts.status, "draft")))
    .returning({ id: posts.id });
  if (!flipped.length) return false;
  await ensurePluginsLoaded();
  const fresh = await getPostById(p.id, true);
  if (fresh) doAction(HOOKS.postPublished, { post: fresh });
  return true;
}

/**
 * 浏览计数（前台每次访问调用）。PV 每次刷新都 +1；UV 按「IP + UA」哈希去重，
 * 同一访客对同一文章只计一次。访客键只存哈希，不落原始 IP/UA。
 */
export async function incrementViews(id: number): Promise<void> {
  const key = await visitorKey();
  let isNewVisitor = false;
  if (key) {
    try {
      // 唯一索引冲突即老访客：ON CONFLICT DO NOTHING 后 returning 为空。
      const inserted = await db
        .insert(postVisitors)
        .values({ postId: id, visitorKey: key })
        .onConflictDoNothing()
        .returning({ postId: postVisitors.postId });
      isNewVisitor = inserted.length > 0;
    } catch {
      // 去重表不可用时退化为只计 PV，不影响文章页渲染。
      isNewVisitor = false;
    }
  }
  if (isNewVisitor) {
    await db.execute(
      sql`update ${posts} set views = views + 1, unique_views = unique_views + 1 where id = ${id}`,
    );
  } else {
    await db.execute(sql`update ${posts} set views = views + 1 where id = ${id}`);
  }
}

/** 取当前请求访客的去重键（IP+UA 的 SHA-256）；请求上下文外返回 null。 */
async function visitorKey(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim() || "";
    const ua = h.get("user-agent") || "";
    if (!ip && !ua) return null;
    return createHash("sha256").update(`${ip}|${ua}`).digest("hex");
  } catch {
    return null;
  }
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
