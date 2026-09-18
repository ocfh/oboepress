"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  type LucideIcon,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { ADMIN_ICONS, type AdminMenuItem } from "@/lib/admin-extensions";

const NAV: { href: string; label: string; exact?: boolean; icon: LucideIcon; adminOnly?: boolean; superOnly?: boolean }[] = [
  { href: "/admin", label: "仪表盘", exact: true, icon: LayoutDashboard },
  { href: "/admin/posts", label: "文章", icon: FileText },
  { href: "/admin/pages", label: "页面", icon: Files },
  { href: "/admin/media", label: "媒体库", icon: Images },
  { href: "/admin/categories", label: "分类", icon: Folder },
  { href: "/admin/tags", label: "标签", icon: Tags },
  { href: "/admin/icons", label: "图标库", icon: Shapes },
  { href: "/admin/comments", label: "评论", icon: MessageSquare, adminOnly: true },
  { href: "/admin/themes", label: "主题", icon: Palette },
  { href: "/admin/widgets", label: "小工具", icon: LayoutGrid, superOnly: true },
  { href: "/admin/menus", label: "菜单", icon: MenuIcon, superOnly: true },
  { href: "/admin/plugins", label: "插件", icon: Plug, superOnly: true },
  { href: "/admin/settings", label: "设置", icon: Settings, superOnly: true },
  { href: "/admin/permalinks", label: "固定链接", icon: Link2, superOnly: true },
  { href: "/admin/security", label: "后台安全", icon: ShieldCheck, superOnly: true },
  { href: "/admin/members", label: "会员注册", icon: UserPlus, superOnly: true },
  { href: "/admin/notify", label: "通知验证码", icon: Bell, superOnly: true },
  { href: "/admin/users", label: "用户", icon: Users, superOnly: true },
];

const STANDALONE = ["/admin/login", "/admin/setup"];

export default function AdminShell({
  user,
  children,
  pluginNav = [],
}: {
  user: SessionUser | null;
  children: React.ReactNode;
  pluginNav?: AdminMenuItem[];
}) {
  const pathname = usePathname();

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

  const visibleNav = NAV.filter((item) => {
    if (item.superOnly) return user.role === "admin";
    if (item.adminOnly) return user.role === "admin" || user.role === "editor";
    return true;
  });

  const visiblePluginNav = pluginNav.filter((item) => {
    if (item.superOnly) return user.role === "admin";
    if (item.adminOnly) return user.role === "admin" || user.role === "editor";
    return true;
  });

  const isActive = (item: (typeof NAV)[number]) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <LayoutDashboard size={20} />
          </span>
          <div>
            <p className="text-lg font-bold leading-tight text-indigo-400">OboePress</p>
            <p className="text-xs text-zinc-500">管理后台</p>
          </div>
        </div>
        <nav className="space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition hover:bg-zinc-800 hover:text-white ${
                  active ? "bg-zinc-800 text-white" : "text-zinc-300"
                }`}
              >
                <Icon size={18} className={active ? "text-indigo-400" : ""} />
                {item.label}
              </Link>
            );
          })}
          {visiblePluginNav.length > 0 && (
            <>
              <div className="my-2 border-t border-zinc-800" />
              {visiblePluginNav.map((item) => {
                const Icon =
                  (item.icon && ADMIN_ICONS[item.icon.toLowerCase()]) || undefined;
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition hover:bg-zinc-800 hover:text-white ${
                      active ? "bg-zinc-800 text-white" : "text-zinc-300"
                    }`}
                  >
                    {Icon ? (
                      <Icon size={18} className={active ? "text-indigo-400" : ""} />
                    ) : (
                      <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
                    )}
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
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
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}