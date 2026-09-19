import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import { HOOKS, applyAsyncFilters } from "@/lib/hooks";
import { ensurePluginsLoaded, listPlugins } from "@/lib/services/plugins";
import { getAdminSecurity } from "@/lib/services/security";
import { getActiveTheme } from "@/lib/services/themes";
import { getThemeManifest } from "@/themes/registry";
import {
  isAdminMenuSection,
  type AdminMenuEntry,
  type AdminMenuItem,
  type AdminMenuSection,
} from "@/lib/admin-extensions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  await ensurePluginsLoaded();

  // 伪装入口开启时，未登录看到的整个 /admin 树（含登录/初始化页）都是 404，
  // 与 Typecho 改名后台目录后的表现一致；真正的登录只在秘密入口进行。
  const sec = await getAdminSecurity();
  const pathname = (
    headers().get("x-invoke-path") ??
    headers().get("next-url") ??
    ""
  ).split("?")[0];
  const standalone = pathname === "/admin/login" || pathname === "/admin/setup";
  if (sec.entryEnabled && !user) notFound();
  // 伪装关闭时保留原有体验：业务页未登录跳登录页（原 edge 重定向下沉到
  // node，因为 edge 读不到伪装配置）。
  if (!user && !standalone) {
    redirect(`/admin/login?from=${encodeURIComponent(pathname || "/admin")}`);
  }

  const [{ items }, pluginList, activeTheme] = await Promise.all([
    applyAsyncFilters(HOOKS.adminMenu, {
      items: [] as AdminMenuEntry[],
    }),
    listPlugins(),
    getActiveTheme(),
  ]);
  // 侧栏「扩展」二级菜单直达各插件自带管理面板（启用且含 admin.tsx）
  const pluginPanels = pluginList
    .filter((p) => p.enabled && p.hasAdmin)
    .map((p) => ({ slug: p.slug, name: p.name }));

  // 钩子条目分流：普通二级项继续进「扩展」组；section 对象提升为一级菜单。
  // 相同 section id 合并，允许多个插件共建同一个一级菜单。
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

  // 当前主题在 manifest.json 声明了 adminMenu 时，提供同名的一级菜单（打样）。
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

  return (
    <AdminShell
      user={user}
      pluginNav={pluginNav}
      pluginPanels={pluginPanels}
      pluginSections={[...sectionMap.values()]}
      themeSection={themeSection}
      activeThemeSlug={activeTheme.slug}
    >
      {children}
    </AdminShell>
  );
}
