import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { menus, menuItems, posts, pages, categories, tags, type MenuItem } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ForbiddenError, NotFoundError } from "./errors";
import { publicCached, cacheKey, bump } from "./public-cache";
import {
  getPermalinkConfig,
  postUrlFor,
  pageUrlFor,
  categoryUrlFor,
  tagUrlFor,
} from "./links";

export type MenuNode = {
  id: number;
  label: string;
  url: string;
  type: string;
  target: string;
  icon: string | null;
  referenceSlug: string | null;
  children: MenuNode[];
};

export type MenuWithItems = {
  id: number;
  location: string;
  name: string;
  items: MenuNode[];
};

export type MenuItemInput = {
  id?: number;
  parentId?: number | null;
  order?: number;
  type?: string;
  label: string;
  url: string;
  referenceSlug?: string | null;
  target?: string;
  icon?: string | null;
};

/**
 * 读时把引用型菜单项（post/page/category/tag）的 url 按当前固定链接配置
 * 实时解析。持久化的引用键是 referenceSlug（文章固定为内容 slug，与链接
 * 模式 id/pinyin 无关），因此改前缀/换模式后菜单链接自动跟随，不再使用
 * 保存时拍下的 url 快照。批量按类型各查一次；查不到（删除/前台未发布）
 * 时回退到存储快照，菜单不会变空链接。
 */
async function resolveMenuUrls(flat: MenuItem[], includeUnpublished: boolean): Promise<MenuItem[]> {
  const groups: Record<string, string[]> = {};
  for (const it of flat) {
    if (it.referenceSlug && (it.type === "post" || it.type === "page" || it.type === "category" || it.type === "tag")) {
      (groups[it.type] ??= []).push(it.referenceSlug);
    }
  }
  if (!Object.keys(groups).length) return flat;

  const cfg = await getPermalinkConfig();
  const resolved = new Map<string, string>();
  const keyOf = (type: string, slug: string) => `${type}:${slug}`;

  if (groups.post) {
    const rows = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        publishedAt: posts.publishedAt,
        createdAt: posts.createdAt,
        status: posts.status,
      })
      .from(posts)
      .where(inArray(posts.slug, groups.post));
    for (const r of rows) {
      if (!includeUnpublished && r.status !== "published") continue;
      resolved.set(keyOf("post", r.slug), postUrlFor(cfg, r));
    }
  }
  if (groups.page) {
    const rows = await db
      .select({ slug: pages.slug, status: pages.status })
      .from(pages)
      .where(inArray(pages.slug, groups.page));
    for (const r of rows) {
      if (!includeUnpublished && r.status !== "published") continue;
      resolved.set(keyOf("page", r.slug), pageUrlFor(cfg, r));
    }
  }
  if (groups.category) {
    const rows = await db.select({ slug: categories.slug }).from(categories).where(inArray(categories.slug, groups.category));
    for (const r of rows) resolved.set(keyOf("category", r.slug), categoryUrlFor(cfg, r));
  }
  if (groups.tag) {
    const rows = await db.select({ slug: tags.slug }).from(tags).where(inArray(tags.slug, groups.tag));
    for (const r of rows) resolved.set(keyOf("tag", r.slug), tagUrlFor(cfg, r));
  }

  return flat.map((it) => {
    if (!it.referenceSlug) return it;
    const url = resolved.get(keyOf(it.type, it.referenceSlug));
    return url ? { ...it, url } : it;
  });
}

/** Build a nested tree from a flat, ordered list of menu items. */
function buildTree(flat: MenuItem[]): MenuNode[] {
  const byId = new Map<number, MenuNode>();
  flat.forEach((it) =>
    byId.set(it.id, {
      id: it.id,
      label: it.label,
      url: it.url,
      type: it.type,
      target: it.target,
      icon: it.icon,
      referenceSlug: it.referenceSlug,
      children: [],
    }),
  );
  const roots: MenuNode[] = [];
  flat.forEach((it) => {
    const node = byId.get(it.id)!;
    if (it.parentId && byId.has(it.parentId)) {
      byId.get(it.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

/** 按 location 的公开菜单：跨请求短 TTL 缓存（自带同请求去重）。
 *  菜单写接口回读走 getMenu(id)，不经过这里，无读后写陈旧问题。 */
export function getMenuByLocation(location: string): Promise<MenuWithItems | null> {
  return publicCached(cacheKey("menus", `loc:${location}`), () =>
    getMenuByLocationUncached(location),
  );
}

async function getMenuByLocationUncached(location: string): Promise<MenuWithItems | null> {
  const [menu] = await db.select().from(menus).where(eq(menus.location, location));
  if (!menu) return null;
  const flat = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.menuId, menu.id))
    .orderBy(asc(menuItems.order), asc(menuItems.id));
  return { id: menu.id, location: menu.location, name: menu.name, items: buildTree(await resolveMenuUrls(flat, false)) };
}

export async function listMenus(): Promise<MenuWithItems[]> {
  const all = await db.select().from(menus).orderBy(asc(menus.id));
  const result: MenuWithItems[] = [];
  for (const menu of all) {
    const flat = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.menuId, menu.id))
      .orderBy(asc(menuItems.order), asc(menuItems.id));
    // 后台需要回显草稿/未发布引用项的当前链接
    result.push({ id: menu.id, location: menu.location, name: menu.name, items: buildTree(await resolveMenuUrls(flat, true)) });
  }
  return result;
}

export async function getMenu(id: number): Promise<MenuWithItems> {
  const [menu] = await db.select().from(menus).where(eq(menus.id, id));
  if (!menu) throw new NotFoundError("菜单不存在");
  const flat = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.menuId, menu.id))
    .orderBy(asc(menuItems.order), asc(menuItems.id));
  return { id: menu.id, location: menu.location, name: menu.name, items: buildTree(await resolveMenuUrls(flat, true)) };
}

export async function createMenu(location: string, name: string): Promise<MenuWithItems> {
  const [row] = await db
    .insert(menus)
    .values({ location, name })
    .onConflictDoUpdate({ target: menus.location, set: { name } })
    .returning();
  bump("menus");
  return { id: row.id, location: row.location, name: row.name, items: [] };
}

export async function updateMenu(
  user: SessionUser,
  id: number,
  input: { name?: string; items?: MenuItemInput[] },
): Promise<MenuWithItems> {
  if (!can(user.role, "settings:manage")) throw new ForbiddenError();
  const [existing] = await db.select().from(menus).where(eq(menus.id, id));
  if (!existing) throw new NotFoundError("菜单不存在");

  if (input.name !== undefined) {
    await db.update(menus).set({ name: input.name, updatedAt: new Date() }).where(eq(menus.id, id));
  }

  const items = input.items;
  if (items) {
    // 整单替换：delete+insert 会让所有行拿到新 id，若此时直接写入旧 parentId，
    // 层级必然全部掉回顶级。改为事务内两阶段——
    //  1) 正整数 id 显式插回（已存在项 id 稳定）；无 id/负临时 id 自动生成；
    //     建立「客户端引用 id -> 真实 id」映射；
    //  2) 按映射回填 parentId，自引用/悬空引用一律置 null 防环。
    await db.transaction(async (tx) => {
      await tx.delete(menuItems).where(eq(menuItems.menuId, id));
      // 客户端引用 id（正=已持久化，负=本次新增的临时 id）-> 真实 id
      const idMap = new Map<number, number>();
      const realIds: number[] = [];

      for (const [i, it] of items.entries()) {
        const row = {
          menuId: id,
          order: it.order ?? i,
          type: it.type ?? "custom",
          label: it.label,
          url: it.url,
          referenceSlug: it.referenceSlug ?? null,
          target: it.target ?? "_self",
          icon: it.icon ?? null,
        };
        const [inserted] =
          typeof it.id === "number" && it.id > 0
            ? await tx.insert(menuItems).values({ id: it.id, ...row }).returning()
            : await tx.insert(menuItems).values(row).returning();
        if (typeof it.id === "number") idMap.set(it.id, inserted.id);
        realIds.push(inserted.id);
      }

      for (const [i, it] of items.entries()) {
        const childId = realIds[i];
        let parentReal: number | null = null;
        if (it.parentId) {
          const mapped = idMap.get(it.parentId);
          if (mapped !== undefined && mapped !== childId) parentReal = mapped;
        }
        if (parentReal !== null) {
          await tx
            .update(menuItems)
            .set({ parentId: parentReal })
            .where(eq(menuItems.id, childId));
        }
      }
    });
    await db.update(menus).set({ updatedAt: new Date() }).where(eq(menus.id, id));
  }

  return getMenu(id).then((m) => {
    bump("menus");
    return m;
  });
}

export async function deleteMenu(user: SessionUser, id: number): Promise<{ id: number }> {
  if (!can(user.role, "settings:manage")) throw new ForbiddenError();
  await db.delete(menus).where(eq(menus.id, id));
  bump("menus");
  return { id };
}

/** Re-register a menu location (used by themes). No-op for the service layer. */
export async function ensureMenuLocation(location: string, name: string): Promise<void> {
  await db.insert(menus).values({ location, name }).onConflictDoNothing({ target: menus.location });
  bump("menus");
  void desc;
}
