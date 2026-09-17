import Link from "next/link";
import { Search } from "lucide-react";
import { getSettings } from "@/lib/services/settings";
import { getMenuByLocation, type MenuNode } from "@/lib/services/menus";
import { getActiveThemeSettings } from "@/lib/services/themes";
import NavTree from "@/components/shared/NavTree";
import ServerIcon from "@/components/shared/ServerIcon";

/**
 * OboePress default theme layout — dark blog with header nav + footer.
 */
export default async function OboePressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, header, footer, ts] = await Promise.all([
    getSettings(),
    getMenuByLocation("header"),
    getMenuByLocation("footer"),
    getActiveThemeSettings(),
  ]);

  // 默认主题的图标开关默认关闭：关闭时菜单完全不显示图标；开启后显示菜单项
  // 上配置的自定义图标（未配置则不显示，主题不提供回退字形）。
  const useCustomIcons = ts.useCustomIcons === true;
  const renderMenuIcon = useCustomIcons
    ? (n: MenuNode) => <ServerIcon name={n.icon} size={15} className="text-[var(--accent)]" />
    : undefined;

  return (
    <div className="theme-root flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-100">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt={settings.siteTitle} className="h-7 w-auto" />
            ) : (
              <>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {settings.siteTitle.slice(0, 1).toUpperCase()}
                </span>
                {settings.siteTitle}
              </>
            )}
          </Link>
          <nav className="ml-2 hidden flex-1 md:block">
            <NavTree
              nodes={header?.items ?? []}
              className="flex flex-wrap items-center"
              renderIcon={renderMenuIcon}
            />
          </nav>
          <form action="/search" method="get" className="ml-auto hidden sm:block">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                name="q"
                placeholder="搜索…"
                className="w-44 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <nav className="mb-4">
            <NavTree
              nodes={footer?.items ?? []}
              className="flex flex-wrap items-center gap-1 text-sm text-zinc-400"
            />
          </nav>
          <p className="text-xs text-zinc-500">
            {settings.footerText || `© ${new Date().getFullYear()} ${settings.siteTitle}`}
          </p>
        </div>
      </footer>
    </div>
  );
}
