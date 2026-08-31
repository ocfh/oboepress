import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, tags } from "@/db/schema";
import type { Category, Tag } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { CategoryInput, TagInput } from "@/lib/validation";
import { can } from "@/lib/rbac";
import { slugify, uniqueSlug } from "@/lib/utils";
import { ForbiddenError, NotFoundError } from "./errors";

// ---------- Categories ----------

export async function listCategories(): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .orderBy(categories.order, desc(categories.createdAt));
}

export async function getCategory(id: number): Promise<Category> {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row) throw new NotFoundError("分类不存在");
  return row;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const [row] = await db.select().from(categories).where(eq(categories.slug, slug));
  return row ?? null;
}

export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const [row] = await db.select().from(tags).where(eq(tags.slug, slug));
  return row ?? null;
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
    })
    .returning();
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
    })
    .where(eq(categories.id, id));
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
  return { updated: items.length };
}

// ---------- Tags ----------

export async function listTags(): Promise<Tag[]> {
  return db.select().from(tags).orderBy(desc(tags.id));
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
    .values({ name: input.name, slug })
    .returning();
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
    .set({ name: input.name ?? existing.name, slug })
    .where(eq(tags.id, id));
  return getTag(id);
}

export async function deleteTag(user: SessionUser, id: number): Promise<{ id: number }> {
  if (!can(user.role, "taxonomy:manage")) throw new ForbiddenError();
  await db.delete(tags).where(eq(tags.id, id));
  return { id };
}
