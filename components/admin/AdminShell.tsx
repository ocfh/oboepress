"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Files,
  Images,
  Folder,
  Tags,
  MessageSquare,
  Palette,
  Menu as MenuIcon,
  Settings,
  Users,
  Plug,
  LayoutGrid,
  Shapes,
  Link2,
  ShieldCheck,
  UserPlus,
  UserRound,
  Bell,
  Share2,
  Construction,
  FileQuestion,
  ScrollText,
  Download,
  DatabaseBackup,
  ChevronDown,
  X,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import {
  ADMIN_ICONS,
  type AdminMenuItem,
  type AdminMenuSection,
} from "@/lib/admin-extensions";

type Leaf = {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** 钩子注入的图标名（与 ADMIN_ICONS 映射） */
  iconName?: string;
  exact?: boolean;
  external?: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
};

type Group = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** 插件/主题一级菜单只能传图标名，渲染时映射 ADMIN_ICONS */
  iconName?: string;
  adminOnly?: boolean;
  superOnly?: boolean;
  children: Leaf[];
};

/** 钩子/清单二级项转侧栏叶子；http(s) 链接自动按外链渲染。 */
function toLeaf(item: AdminMenuItem): Leaf {
  return {
    href: item.href,
    label: item.label,
    iconName: item.icon,
    exact: item.exact,
    external: item.external ?? /^https?:\/\//i.test(item.href),
    adminOnly: item.adminOnly,
    superOnly: item.superOnly,
  };
}

const STANDALONE = ["/admin/login", "/admin/setup"];

export default function AdminShell({
  user,
  children,
  pluginNav = [],
  pluginPanels = [],
  pluginSections = [],
  themeSection = null,
  activeThemeSlug = "",
}: {
  user: SessionUser | null;
  children: React.ReactNode;
  pluginNav?: AdminMenuItem[];
  /** 已启用且自带管理面板的插件（服务端收集，直达 /admin/plugins/[slug]） */
  pluginPanels?: { slug: string; name: string }[];
  /** 插件经 admin.menu 钩子注册的一级菜单 */
  pluginSections?: AdminMenuSection[];
  /** 当前主题在 manifest.json 声明的一级菜单（打样） */
  themeSection?: AdminMenuSection | null;
  /** 当前启用主题 slug，用于「外观 → 主题设置」直达兜底 */
  activeThemeSlug?: string;
}) {
  const pathname = usePathname();
  // 移动端侧栏抽屉：≤lg 屏宽时侧栏收起为左滑抽屉 + 遮罩，避免把业务区挤死
  const [navOpen, setNavOpen] = useState(false);
  // 手风琴显式开合状态；未操作过的分组默认展开「含当前路由」的那一组
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  // 登录与初始化页不套后台壳，直接原样渲染（绕过未登录重定向，避免 307 自跳死循环）
  if (STANDALONE.includes(pathname)) {
    return <>{children}</>;
  }

  // 业务页兜底：会话无效时给出登录提示，而不是渲染依赖用户的壳导致报错
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
        <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-200">请先登录</h1>
          <p className="mt-2 text-sm text-zinc-400">后台需要登录后才能访问，请先登录账号。</p>
          <Link
            href="/admin/login"
            className="mt-5 inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            前往登录
          </Link>
        </div>
      </div>
    );
  }

  const can = (leaf: { adminOnly?: boolean; superOnly?: boolean }) => {
    if (leaf.superOnly) return user.role === "admin";
    if (leaf.adminOnly) return user.role === "admin" || user.role === "editor";
    return true;
  };

  const isActive = (leaf: { href: string; exact?: boolean }) =>
    leaf.exact
      ? pathname === leaf.href
      : pathname === leaf.href || pathname.startsWith(leaf.href + "/");

  // 全侧栏共享的 href 去重集合：面板直达、扩展组钩子项、插件/主题一级菜单
  // 里的二级项都过同一道，任何链接只出现一次。
  const panelHrefs = new Set(pluginPanels.map((p) => `/admin/plugins/${p.slug}`));
  const seen = new Set<string>();
  const dedupe = (item: AdminMenuItem): Leaf | null => {
    if (panelHrefs.has(item.href) || seen.has(item.href)) return null;
    seen.add(item.href);
    return toLeaf(item);
  };
  const sectionToGroup = (s: AdminMenuSection): Group => ({
    id: `sec:${s.section}`,
    label: s.label,
    iconName: s.icon,
    adminOnly: s.adminOnly,
    superOnly: s.superOnly,
    children: s.items.map(dedupe).filter((l): l is Leaf => l !== null),
  });

  const themeGroup = themeSection ? sectionToGroup(themeSection) : null;
  // 主题已自带一级菜单时，外观组里不再重复挂「主题设置」。
  const pluginSectionGroups = pluginSections.map(sectionToGroup);

  const groups: Group[] = [
    {
      id: "content",
      label: "内容",
      icon: FileText,
      children: [
        { href: "/admin/posts", label: "文章", icon: FileText },
        { href: "/admin/pages", label: "页面", icon: Files },
        { href: "/admin/categories", label: "分类", icon: Folder },
        { href: "/admin/tags", label: "标签", icon: Tags },
        { href: "/admin/comments", label: "评论", icon: MessageSquare, adminOnly: true },
        { href: "/admin/media", label: "媒体库", icon: Images },
        { href: "/admin/icons", label: "图标库", icon: Shapes },
      ],
    },
    {
      id: "appearance",
      label: "外观",
      icon: Palette,
      children: [
        // 直达当前主题设置页（参考 WordPress「外观 → 主题文件/自定义」）；
        // 主题已声明自己的一级菜单时该入口交给主题组，这里不重复。
        ...(activeThemeSlug && !themeGroup
          ? [{ href: `/admin/themes/${activeThemeSlug}`, label: "主题设置", icon: Palette }]
          : []),
        { href: "/admin/themes", label: "全部主题", icon: Palette, exact: true },
        { href: "/admin/widgets", label: "小工具", icon: LayoutGrid, superOnly: true },
        { href: "/admin/menus", label: "菜单", icon: MenuIcon, superOnly: true },
      ],
    },
    // 主题一级菜单（打样位，紧跟外观组）
    ...(themeGroup ? [themeGroup] : []),
    {
      id: "plugins",
      label: "扩展",
      icon: Plug,
      superOnly: true,
      children: [
        // 直达每个启用插件自带的管理面板
        ...pluginPanels.map<Leaf>((p) => ({
          href: `/admin/plugins/${p.slug}`,
          label: p.name,
        })),
        // 插件自身经 admin.menu 钩子注入的入口；面板已直达、或侧栏别处已有
        // （如插件自建一级菜单）的同 href 项一律去重。
        ...pluginNav.map(dedupe).filter((l): l is Leaf => l !== null),
        { href: "/admin/plugins", label: "全部插件", icon: Plug, exact: true },
      ],
    },
    // 插件自建一级菜单（愿意提升的插件才出现，不强制）
    ...pluginSectionGroups,
    {
      id: "system",
      label: "系统",
      icon: Settings,
      superOnly: true,
      children: [
        { href: "/admin/settings", label: "站点设置", icon: Settings },
        { href: "/admin/permalinks", label: "固定链接", icon: Link2 },
        { href: "/admin/security", label: "后台安全", icon: ShieldCheck },
        { href: "/admin/maintenance", label: "维护模式", icon: Construction },
        { href: "/admin/notfound", label: "404 页面", icon: FileQuestion },
        { href: "/admin/security-logs", label: "安全日志", icon: ScrollText },
        { href: "/admin/members", label: "会员注册", icon: UserPlus },
        { href: "/admin/oauth", label: "第三方登录", icon: Share2 },
        { href: "/admin/notify", label: "通知验证码", icon: Bell },
        { href: "/admin/users", label: "用户", icon: Users },
        { href: "/admin/export", label: "内容导出", icon: Download },
        { href: "/admin/backup", label: "备份与恢复", icon: DatabaseBackup },
      ],
    },
  ];

  const dashboardActive = pathname === "/admin";

  return (
    <div className="min-h-screen">
      {/* 移动端顶栏：汉堡 + 标题（lg 以上侧栏常驻，此栏隐藏） */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 lg:hidden">
        <button
          type="button"
          aria-label="打开菜单"
          onClick={() => setNavOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
        >
          <MenuIcon size={20} />
        </button>
        <span className="text-base font-bold text-indigo-400">OboePress 管理后台</span>
      </div>

      {/* 移动端抽屉遮罩：点击收起 */}
      {navOpen && (
        <div
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <div className="flex">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-4 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <LayoutDashboard size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight text-indigo-400">OboePress</p>
            <p className="text-xs text-zinc-500">管理后台</p>
          </div>
          {/* 抽屉内关闭钮（lg 以上侧栏常驻，隐藏） */}
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={() => setNavOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-800 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-0.5">
          {/* 仪表盘：独立顶级入口 */}
          <Link
            href="/admin"
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition hover:bg-zinc-800 hover:text-white ${
              dashboardActive ? "bg-zinc-800 text-white" : "text-zinc-300"
            }`}
          >
            <LayoutDashboard size={18} className={dashboardActive ? "text-indigo-400" : ""} />
            仪表盘
          </Link>

          {groups.map((group) => {
            if (!can(group)) return null;
            const leaves = group.children.filter(can);
            if (leaves.length === 0) return null;
            const groupActive = leaves.some(isActive);
            // 未显式操作时，包含当前路由的分组默认展开
            const open = openMap[group.id] ?? groupActive;
            // 核心组直接持有图标组件；插件/主题组只给了图标名，走名称映射，
            // 未登记的名字回退为通用插头图标。
            const GroupIcon =
              group.icon ||
              (group.iconName ? ADMIN_ICONS[group.iconName.toLowerCase()] : undefined) ||
              Plug;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => setOpenMap((m) => ({ ...m, [group.id]: !open }))}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition hover:bg-zinc-800/60 hover:text-zinc-200 ${
                    groupActive ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  <GroupIcon size={15} className={groupActive ? "text-indigo-400" : ""} />
                  {group.label}
                  <ChevronDown
                    size={14}
                    className={`ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="mt-0.5 space-y-0.5 pb-1">
                    {leaves.map((leaf) => {
                      const active = isActive(leaf);
                      const Icon =
                        leaf.icon ||
                        (leaf.iconName
                          ? ADMIN_ICONS[leaf.iconName.toLowerCase()]
                          : undefined);
                      const inner = (
                        <>
                          {Icon ? (
                            <Icon size={15} className={active ? "text-indigo-400" : ""} />
                          ) : (
                            <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                          )}
                          <span className="truncate">{leaf.label}</span>
                          {leaf.external && (
                            <ExternalLink
                              size={11}
                              className="ml-auto shrink-0 opacity-60"
                              aria-label="外部链接"
                            />
                          )}
                        </>
                      );
                      const cls = `flex items-center gap-2.5 rounded-md py-1.5 pl-9 pr-3 text-[13px] transition hover:bg-zinc-800/60 hover:text-white ${
                        active ? "bg-zinc-800 text-white" : "text-zinc-400"
                      }`;
                      // 外链二级项（说明文档、作者网址等）用原生 <a> 新标签打开。
                      return leaf.external ? (
                        <a
                          key={leaf.href}
                          href={leaf.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className={cls}
                        >
                          {inner}
                        </a>
                      ) : (
                        <Link key={leaf.href} href={leaf.href} className={cls}>
                          {inner}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-zinc-800 pt-4">
          <Link
            href="/admin/account"
            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            <UserRound size={16} className={pathname === "/admin/account" ? "text-indigo-400" : ""} />
            我的账号
          </Link>
          <div className="mb-3 mt-1 flex items-center gap-3 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200">{user.name}</p>
              <p className="truncate text-xs text-indigo-400">{user.role}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
