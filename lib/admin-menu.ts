import type { Role } from "@/db/schema";
import { HOOKS, applyAsyncFilters } from "@/lib/hooks";
import { ensurePluginsLoaded, listPlugins } from "@/lib/services/plugins";
import { getActiveTheme } from "@/lib/services/themes";
import { getThemeManifest } from "@/themes/registry";
import { getOption, setOption } from "@/lib/services/options";
import {
  isAdminMenuSection,
  type AdminMenuEntry,
  type AdminMenuItem,
  type AdminMenuSection,
} from "@/lib/admin-extensions";

export type AdminMenuLeaf = {
  href: string;
  label: string;
  icon?: string;
  exact?: boolean;
  external?: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
  /** 插件/主题钩子注入：允许显隐，但不能设为首页 */
  hook?: boolean;
  /** 系统锁定：始终显示，既不能隐藏也不能设为首页 */
  locked?: boolean;
};

export type AdminMenuGroup = {
  id: string;
  label: string;
  icon?: string;
  adminOnly?: boolean;
  superOnly?: boolean;
  children: AdminMenuLeaf[];
};

export const ADMIN_HOME_DEFAULT = "/admin";
const OPTION_HIDDEN = "adminMenuHidden";
const OPTION_HOME = "adminHomePath";

/** 仪表盘是独立顶级入口，在菜单管理里以固定虚拟条目参与显隐/首页设置。 */
export const DASHBOARD_LEAF: AdminMenuLeaf = {
  href: ADMIN_HOME_DEFAULT,
  label: "仪表盘",
  icon: "dashboard",
  exact: true,
};

export async function collectAdminMenuExtras() {
  await ensurePluginsLoaded();
  const [{ items }, pluginList, activeTheme] = await Promise.all([
    applyAsyncFilters(HOOKS.adminMenu, {
      items: [] as AdminMenuEntry[],
    }),
    listPlugins(),
    getActiveTheme(),
  ]);
  const pluginPanels = pluginList
    .filter((p) => p.enabled && p.hasAdmin)
    .map((p) => ({ slug: p.slug, name: p.name }));

  const pluginNav: AdminMenuItem[] = [];
  const sectionMap = new Map<string, AdminMenuSection>();
  for (const entry of items) {
    if (isAdminMenuSection(entry)) {
      const existing = sectionMap.get(entry.section);
      if (existing) existing.items.push(...entry.items);
      else sectionMap.set(entry.section, { ...entry, items: [...entry.items] });
    } else {
      pluginNav.push(entry);
    }
  }

  const themeManifest = getThemeManifest(activeTheme.slug);
  let themeSection: AdminMenuSection | null = null;
  if (themeManifest?.adminMenu?.items?.length) {
    const am = themeManifest.adminMenu;
    themeSection = {
      section: `theme:${activeTheme.slug}`,
      label: am.label ?? `${themeManifest.name} 主题`,
      ...(am.icon ? { icon: am.icon } : {}),
      ...(am.adminOnly ? { adminOnly: true } : {}),
      ...(am.superOnly ? { superOnly: true } : {}),
      items: am.items,
    };
  }

  return {
    pluginNav,
    pluginPanels,
    pluginSections: [...sectionMap.values()],
    themeSection,
    activeThemeSlug: activeTheme.slug,
  };
}

export type AdminMenuExtras = Awaited<ReturnType<typeof collectAdminMenuExtras>>;

function hookLeaf(item: AdminMenuItem): AdminMenuLeaf {
  return {
    href: item.href,
    label: item.label,
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.exact ? { exact: true } : {}),
    external: item.external ?? /^https?:\/\//i.test(item.href),
    ...(item.adminOnly ? { adminOnly: true } : {}),
    ...(item.superOnly ? { superOnly: true } : {}),
    hook: true,
  };
}

/** 侧栏菜单的唯一数据源：核心组 + 插件/主题钩子，顺序即展示顺序。 */
export function buildAdminMenuGroups(extras: AdminMenuExtras): AdminMenuGroup[] {
  const { pluginNav, pluginPanels, pluginSections, themeSection, activeThemeSlug } =
    extras;
  const panelHrefs = new Set(pluginPanels.map((p) => `/admin/plugins/${p.slug}`));
  const seen = new Set<string>();
  const dedupe = (item: AdminMenuItem): AdminMenuLeaf | null => {
    if (panelHrefs.has(item.href) || seen.has(item.href)) return null;
    seen.add(item.href);
    return hookLeaf(item);
  };
  const sectionToGroup = (s: AdminMenuSection): AdminMenuGroup => ({
    id: `sec:${s.section}`,
    label: s.label,
    ...(s.icon ? { icon: s.icon } : {}),
    ...(s.adminOnly ? { adminOnly: true } : {}),
    ...(s.superOnly ? { superOnly: true } : {}),
    children: s.items.map(dedupe).filter((l): l is AdminMenuLeaf => l !== null),
  });

  const themeGroup = themeSection ? sectionToGroup(themeSection) : null;

  return [
    {
      id: "content",
      label: "内容管理",
      icon: "filetext",
      children: [
        { href: "/admin/posts", label: "文章", icon: "filetext" },
        { href: "/admin/pages", label: "页面", icon: "files" },
        { href: "/admin/categories", label: "分类", icon: "folder" },
        { href: "/admin/tags", label: "标签", icon: "tags" },
        { href: "/admin/comments", label: "评论", icon: "message-square", adminOnly: true },
        { href: "/admin/media", label: "媒体库", icon: "image" },
        { href: "/admin/icons", label: "图标库", icon: "shapes" },
      ],
    },
    {
      id: "appearance",
      label: "外观设置",
      icon: "palette",
      children: [
        ...(activeThemeSlug && !themeGroup
          ? [{ href: `/admin/themes/${activeThemeSlug}`, label: "主题设置", icon: "palette" }]
          : []),
        { href: "/admin/themes", label: "全部主题", icon: "palette", exact: true },
        { href: "/admin/widgets", label: "小工具", icon: "layoutgrid", superOnly: true },
        { href: "/admin/menus", label: "菜单", icon: "menu", superOnly: true },
      ],
    },
    ...(themeGroup ? [themeGroup] : []),
    {
      id: "plugins",
      label: "插件扩展",
      icon: "plug",
      superOnly: true,
      children: [
        ...pluginPanels.map<AdminMenuLeaf>((p) => ({
          href: `/admin/plugins/${p.slug}`,
          label: p.name,
          icon: "plug",
          hook: true,
        })),
        ...pluginNav.map(dedupe).filter((l): l is AdminMenuLeaf => l !== null),
        { href: "/admin/plugins", label: "全部插件", icon: "plug", exact: true },
      ],
    },
    ...pluginSections.map(sectionToGroup),
    {
      id: "system",
      label: "系统设置",
      icon: "settings",
      superOnly: true,
      children: [
        { href: "/admin/settings", label: "站点设置", icon: "settings" },
        { href: "/admin/permalinks", label: "固定链接", icon: "link" },
        { href: "/admin/menu-settings", label: "菜单与首页", icon: "panel-left", locked: true },
        { href: "/admin/security", label: "后台安全", icon: "shield" },
        { href: "/admin/maintenance", label: "维护模式", icon: "construction" },
        { href: "/admin/notfound", label: "404 页面", icon: "file-question" },
        { href: "/admin/security-logs", label: "安全日志", icon: "scroll-text" },
        { href: "/admin/members", label: "会员注册", icon: "user-plus" },
        { href: "/admin/oauth", label: "第三方登录", icon: "share-2" },
        { href: "/admin/notify", label: "通知验证码", icon: "bell" },
        { href: "/admin/users", label: "用户", icon: "users" },
        { href: "/admin/export", label: "内容导出", icon: "download" },
        { href: "/admin/backup", label: "备份与恢复", icon: "database-backup" },
      ],
    },
  ];
}

function roleAllows(
  role: Role,
  x: { adminOnly?: boolean; superOnly?: boolean },
): boolean {
  if (x.superOnly) return role === "admin";
  if (x.adminOnly) return role === "admin" || role === "editor";
  return true;
}

/** 供设置页展示：仪表盘虚拟组 + 全部菜单组（设置页本身仅超管可进，不做角色过滤）。 */
export function buildAdminMenuAll(extras: AdminMenuExtras): AdminMenuGroup[] {
  return [
    { id: "top", label: "顶部入口", icon: "dashboard", children: [DASHBOARD_LEAF] },
    ...buildAdminMenuGroups(extras),
  ];
}

/** 供侧栏渲染：按角色与隐藏集合过滤，空组直接剔除。 */
export function filterGroupsForShell(
  groups: AdminMenuGroup[],
  role: Role,
  hiddenHrefs: string[],
): AdminMenuGroup[] {
  const hidden = new Set(hiddenHrefs);
  const out: AdminMenuGroup[] = [];
  for (const g of groups) {
    if (!roleAllows(role, g)) continue;
    const children = g.children.filter(
      (l) => roleAllows(role, l) && !hidden.has(l.href),
    );
    if (children.length) out.push({ ...g, children });
  }
  return out;
}

export async function getAdminMenuPrefs(): Promise<{
  hiddenHrefs: string[];
  homePath: string;
}> {
  const [hidden, home] = await Promise.all([
    getOption<unknown>(OPTION_HIDDEN, []),
    getOption<unknown>(OPTION_HOME, ADMIN_HOME_DEFAULT),
  ]);
  return {
    hiddenHrefs: Array.isArray(hidden)
      ? hidden.filter((x): x is string => typeof x === "string")
      : [],
    homePath:
      typeof home === "string" && home.startsWith("/admin")
        ? home
        : ADMIN_HOME_DEFAULT,
  };
}

/**
 * 保存菜单偏好并回传清洗后的结果。约束：
 * - 首页必须是核心内部页面（钩子项/外链/锁定项不可作首页）；
 * - 当前首页与锁定项不可隐藏，未知 href 静默丢弃。
 */
export async function saveAdminMenuPrefs(input: {
  hiddenHrefs: unknown;
  homePath: unknown;
}): Promise<{ hiddenHrefs: string[]; homePath: string }> {
  const extras = await collectAdminMenuExtras();
  const leaves = [DASHBOARD_LEAF, ...buildAdminMenuGroups(extras).flatMap((g) => g.children)];
  const byHref = new Map(leaves.map((l) => [l.href, l]));

  const home =
    typeof input.homePath === "string" ? input.homePath : ADMIN_HOME_DEFAULT;
  if (home !== ADMIN_HOME_DEFAULT) {
    const leaf = byHref.get(home);
    if (!leaf || leaf.hook || leaf.external || leaf.locked) {
      throw new Error("首页只能设为系统内置页面");
    }
  }

  const rawHidden = Array.isArray(input.hiddenHrefs) ? input.hiddenHrefs : [];
  const hiddenHrefs = [
    ...new Set(
      rawHidden.filter(
        (x): x is string =>
          typeof x === "string" &&
          byHref.has(x) &&
          x !== home &&
          !byHref.get(x)?.locked,
      ),
    ),
  ];

  await Promise.all([
    setOption(OPTION_HIDDEN, hiddenHrefs),
    setOption(OPTION_HOME, home),
  ]);
  return { hiddenHrefs, homePath: home };
}
