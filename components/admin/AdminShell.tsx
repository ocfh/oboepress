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
  PanelLeft,
  ChevronDown,
  X,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { ADMIN_ICONS } from "@/lib/admin-extensions";
import type { AdminMenuGroup, AdminMenuLeaf } from "@/lib/admin-menu";

const CORE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  filetext: FileText,
  files: Files,
  folder: Folder,
  tags: Tags,
  "message-square": MessageSquare,
  image: Images,
  shapes: Shapes,
  palette: Palette,
  layoutgrid: LayoutGrid,
  menu: MenuIcon,
  plug: Plug,
  settings: Settings,
  link: Link2,
  "panel-left": PanelLeft,
  shield: ShieldCheck,
  construction: Construction,
  "file-question": FileQuestion,
  "scroll-text": ScrollText,
  "user-plus": UserPlus,
  "share-2": Share2,
  bell: Bell,
  users: Users,
  download: Download,
  "database-backup": DatabaseBackup,
};

function resolveIcon(name: string | undefined, fallback: LucideIcon): LucideIcon {
  if (name) return CORE_ICONS[name] ?? ADMIN_ICONS[name.toLowerCase()] ?? fallback;
  return fallback;
}

const STANDALONE = ["/admin/login", "/admin/setup"];

export default function AdminShell({
  user,
  children,
  groups = [],
  showDashboard = true,
  dashboardHref = "/admin",
}: {
  user: SessionUser | null;
  children: React.ReactNode;
  groups?: AdminMenuGroup[];
  /** 仪表盘入口是否显示（可在菜单设置中隐藏，隐藏后 /admin 跳自定义首页） */
  showDashboard?: boolean;
  /** 自定义了其他首页时，仪表盘搬到 /admin/dashboard */
  dashboardHref?: string;
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

  const isActive = (leaf: AdminMenuLeaf) =>
    leaf.exact
      ? pathname === leaf.href
      : pathname === leaf.href || pathname.startsWith(leaf.href + "/");

  const dashboardActive = pathname === dashboardHref;

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
          {/* 仪表盘：独立顶级入口（被设为隐藏时不渲染） */}
          {showDashboard && (
            <Link
              href={dashboardHref}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition hover:bg-zinc-800 hover:text-white ${
                dashboardActive ? "bg-zinc-800 text-white" : "text-zinc-300"
              }`}
            >
              <LayoutDashboard size={18} className={dashboardActive ? "text-indigo-400" : ""} />
              仪表盘
            </Link>
          )}

          {groups.map((group) => {
            const leaves = group.children;
            const groupActive = leaves.some(isActive);
            // 未显式操作时，包含当前路由的分组默认展开
            const open = openMap[group.id] ?? groupActive;
            const GroupIcon = resolveIcon(
              group.icon,
              group.id.startsWith("sec:") ? LayoutDashboard : Plug,
            );
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
                      // 二级项未声明图标（或名字未登记）时继承所属一级菜单图标。
                      const Icon = resolveIcon(leaf.icon, GroupIcon);
                      const inner = (
                        <>
                          <Icon size={15} className={active ? "text-indigo-400" : ""} />
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
