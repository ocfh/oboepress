import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, tags } from "@/db/schema";
import type { Category, Tag } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { CategoryInput, TagInput } from "@/lib/validation";
import { can } from "@/lib/rbac";
import { slugify, uniqueSlug } from "@/lib/utils";
import { ForbiddenError, NotFoundError } from "./errors";
import { getPermalinkConfig, categoryUrlFor, tagUrlFor } from "./links";
import { publicCached, cacheKey, bump } from "./public-cache";

/** Category row plus its public URL under the current permalink config. */
export type CategoryWithUrl = Category & { url: string };
/** Tag row plus its public URL under the current permalink config. */
export type TagWithUrl = Tag & { url: string };

/** 空串视为清除，统一落 NULL；undefined 表示本次不更新该列。 */
function clean(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  return v === "" || v === null ? null : v;
}

// ---------- Categories ----------

/** 全量分类：跨请求短 TTL 缓存（publicCached 自带同请求去重），分类写路径主动失效。
 *  分类写接口直接返回被保存的行，不存在请求内读后写依赖。 */
export function listCategories(): Promise<CategoryWithUrl[]> {
  return publicCached(cacheKey("tax", "cats"), listCategoriesUncached);
}

async function listCategoriesUncached(): Promise<CategoryWithUrl[]> {
  const [rows, cfg] = await Promise.all([
    db
      .select()
      .from(categories)
      .orderBy(categories.order, desc(categories.createdAt)),
    getPermalinkConfig(),
  ]);
  return rows.map((c) => ({ ...c, url: categoryUrlFor(cfg, c) }));
}

export async function getCategory(id: number): Promise<Category> {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row) throw new NotFoundError("分类不存在");
  return row;
}

/** 分类路由解析高频调用，缓存 null 同样有价值（404 不再查库）。 */
export function getCategoryBySlug(slug: string): Promise<Category | null> {
  return publicCached(cacheKey("tax", `cat-slug:${slug}`), () =>
    getCategoryBySlugUncached(slug),
  );
}

async function getCategoryBySlugUncached(slug: string): Promise<Category | null> {
  const [row] = await db.select().from(categories).where(eq(categories.slug, slug));
  return row ?? null;
}

export function getTagBySlug(slug: string): Promise<Tag | null> {
  return publicCached(cacheKey("tax", `tag-slug:${slug}`), () =>
    getTagBySlugUncached(slug),
  );
}

async function getTagBySlugUncached(slug: string): Promise<Tag | null> {
  const [row] = await db.select().from(tags).where(eq(tags.slug, slug));
  return row ?? null;
}

/** 分类/标签写入统一失效：tax 实体 + 内嵌分类/标签的文章列表与小工具。 */
function bumpTaxCaches() {
  bump("tax");
  bump("posts");
  bump("widgets");
}

export async function createCategory(
  user: SessionUser,
  input: CategoryInput,
): Promise<Category> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  const base = slugify(input.slug || input.name);
  const rows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(sql`${categories.slug} LIKE ${base + "%"}`);
  const slug = uniqueSlug(base, new Set(rows.map((r) => r.slug)));
  const [row] = await db
    .insert(categories)
    .values({
      name: input.name,
      slug,
      description: input.description,
      parentId: input.parentId ?? null,
      icon: input.icon ?? null,
      seoTitle: clean(input.seoTitle) ?? null,
      seoDescription: clean(input.seoDescription) ?? null,
      seoKeywords: clean(input.seoKeywords) ?? null,
    })
    .returning();
  bumpTaxCaches();
  return row;
}

export async function updateCategory(
  user: SessionUser,
  id: number,
  input: Partial<CategoryInput>,
): Promise<Category> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  const existing = await getCategory(id);
  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const base = slugify(input.slug);
    const rows = await db
      .select({ slug: categories.slug })
      .from(categories)
      .where(sql`${categories.slug} LIKE ${base + "%"}`);
    const taken = new Set(rows.map((r) => r.slug));
    taken.delete(existing.slug);
    slug = uniqueSlug(base, taken);
  }
  await db
    .update(categories)
    .set({
      name: input.name ?? existing.name,
      slug,
      description:
        input.description !== undefined ? input.description : existing.description,
      parentId:
        input.parentId !== undefined ? input.parentId ?? null : existing.parentId,
      icon: input.icon !== undefined ? input.icon : existing.icon,
      ...(input.seoTitle !== undefined
        ? { seoTitle: input.seoTitle || null }
        : {}),
      ...(input.seoDescription !== undefined
        ? { seoDescription: input.seoDescription || null }
        : {}),
      ...(input.seoKeywords !== undefined
        ? { seoKeywords: input.seoKeywords || null }
        : {}),
    })
    .where(eq(categories.id, id));
  bumpTaxCaches();
  return getCategory(id);
}

export async function deleteCategory(user: SessionUser, id: number): Promise<{ id: number }> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  // Promote any child categories back to first-level so they don't dangle.
  await db
    .update(categories)
    .set({ parentId: null })
    .where(eq(categories.parentId, id));
  await db.delete(categories).where(eq(categories.id, id));
  bumpTaxCaches();
  return { id };
}

/** Persist the full drag-reordered category tree (order + parent). */
export async function reorderCategories(
  user: SessionUser,
  items: { id: number; parentId: number | null; order: number }[],
): Promise<{ updated: number }> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  for (const it of items) {
    await db
      .update(categories)
      .set({ order: it.order, parentId: it.parentId })
      .where(eq(categories.id, it.id));
  }
  bumpTaxCaches();
  return { updated: items.length };
}

// ---------- Tags ----------

/** 标签云跨请求短 TTL 缓存，标签写路径主动失效。 */
export function listTags(): Promise<TagWithUrl[]> {
  return publicCached(cacheKey("tax", "tags"), listTagsUncached);
}

async function listTagsUncached(): Promise<TagWithUrl[]> {
  const [rows, cfg] = await Promise.all([
    db.select().from(tags).orderBy(desc(tags.id)),
    getPermalinkConfig(),
  ]);
  return rows.map((t) => ({ ...t, url: tagUrlFor(cfg, t) }));
}

export async function getTag(id: number): Promise<Tag> {
  const [row] = await db.select().from(tags).where(eq(tags.id, id));
  if (!row) throw new NotFoundError("标签不存在");
  return row;
}

export async function createTag(user: SessionUser, input: TagInput): Promise<Tag> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  const base = slugify(input.slug || input.name);
  const rows = await db
    .select({ slug: tags.slug })
    .from(tags)
    .where(sql`${tags.slug} LIKE ${base + "%"}`);
  const slug = uniqueSlug(base, new Set(rows.map((r) => r.slug)));
  const [row] = await db
    .insert(tags)
    .values({
      name: input.name,
      slug,
      seoTitle: clean(input.seoTitle) ?? null,
      seoDescription: clean(input.seoDescription) ?? null,
      seoKeywords: clean(input.seoKeywords) ?? null,
    })
    .returning();
  bumpTaxCaches();
  return row;
}

export async function updateTag(
  user: SessionUser,
  id: number,
  input: Partial<TagInput>,
): Promise<Tag> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  const existing = await getTag(id);
  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    const base = slugify(input.slug);
    const rows = await db
      .select({ slug: tags.slug })
      .from(tags)
      .where(sql`${tags.slug} LIKE ${base + "%"}`);
    const taken = new Set(rows.map((r) => r.slug));
    taken.delete(existing.slug);
    slug = uniqueSlug(base, taken);
  }
  await db
    .update(tags)
    .set({
      name: input.name ?? existing.name,
      slug,
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle || null } : {}),
      ...(input.seoDescription !== undefined
        ? { seoDescription: input.seoDescription || null }
        : {}),
      ...(input.seoKeywords !== undefined
        ? { seoKeywords: input.seoKeywords || null }
        : {}),
    })
    .where(eq(tags.id, id));
  bumpTaxCaches();
  return getTag(id);
}

export async function deleteTag(user: SessionUser, id: number): Promise<{ id: number }> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  await db.delete(tags).where(eq(tags.id, id));
  bumpTaxCaches();
  return { id };
}
