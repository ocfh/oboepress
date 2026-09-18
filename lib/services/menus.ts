import { cache } from "react";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { menus, menuItems, type MenuItem } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ForbiddenError, NotFoundError } from "./errors";

export type MenuNode = {
  id: number;
  label: string;
  url: string;
  type: string;
  target: string;
  icon: string | null;
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

/** 请求级去重（按 location）：主题 Layout 与各导航组件同请求内共享。
 *  菜单写接口回读走 getMenu(id)，不经过这里，无读后写陈旧问题。 */
export const getMenuByLocation = cache(async (location: string): Promise<MenuWithItems | null> => {
  const [menu] = await db.select().from(menus).where(eq(menus.location, location));
  if (!menu) return null;
  const flat = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.menuId, menu.id))
    .orderBy(asc(menuItems.order), asc(menuItems.id));
  return { id: menu.id, location: menu.location, name: menu.name, items: buildTree(flat) };
});

export async function listMenus(): Promise<MenuWithItems[]> {
  const all = await db.select().from(menus).orderBy(asc(menus.id));
  const result: MenuWithItems[] = [];
  for (const menu of all) {
    const flat = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.menuId, menu.id))
      .orderBy(asc(menuItems.order), asc(menuItems.id));
    result.push({ id: menu.id, location: menu.location, name: menu.name, items: buildTree(flat) });
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
  return { id: menu.id, location: menu.location, name: menu.name, items: buildTree(flat) };
}

export async function createMenu(location: string, name: string): Promise<MenuWithItems> {
  const [row] = await db
    .insert(menus)
    .values({ location, name })
    .onConflictDoUpdate({ target: menus.location, set: { name } })
    .returning();
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

  if (input.items) {
    // Replace the whole item set. We keep ids stable when provided so the
    // client can manage ordering/parenting without surprises.
    await db.delete(menuItems).where(eq(menuItems.menuId, id));
    if (input.items.length) {
      await db.insert(menuItems).values(
        input.items.map((it, i) => ({
          menuId: id,
          parentId: it.parentId ?? null,
          order: it.order ?? i,
          type: it.type ?? "custom",
          label: it.label,
          url: it.url,
          referenceSlug: it.referenceSlug ?? null,
          target: it.target ?? "_self",
          icon: it.icon ?? null,
        })),
      );
    }
    await db.update(menus).set({ updatedAt: new Date() }).where(eq(menus.id, id));
  }

  return getMenu(id);
}

export async function deleteMenu(user: SessionUser, id: number): Promise<{ id: number }> {
  if (!can(user.role, "settings:manage")) throw new ForbiddenError();
  await db.delete(menus).where(eq(menus.id, id));
  return { id };
}

/** Re-register a menu location (used by themes). No-op for the service layer. */
export async function ensureMenuLocation(location: string, name: string): Promise<void> {
  await db.insert(menus).values({ location, name }).onConflictDoNothing({ target: menus.location });
  void desc;
}
