import Link from "next/link";
import { Search, Folder, Tags, Clock } from "lucide-react";
import { listCategories, listTags } from "@/lib/services/taxonomies";
import { listPosts } from "@/lib/services/posts";
import { getActiveThemeSettings } from "@/lib/services/themes";
import { formatDate } from "@/lib/utils";
import ServerIcon from "@/components/shared/ServerIcon";

export default async function Sidebar() {
  const [cats, tags, recent, ts] = await Promise.all([
    listCategories(),
    listTags(),
    listPosts({ status: "published", limit: 5 }),
    getActiveThemeSettings(),
  ]);
  // 仅当主题显式开启「获取自定义图标」时，侧栏分类才显示配置的图标。
  const showCatIcons = ts.useCustomIcons === true;

  return (
    <aside className="space-y-6">
      <form action="/search" method="get" className="block">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            name="q"
            placeholder="搜索文章…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-4 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </form>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          <Folder size={15} />
          分类
        </h3>
        <ul className="space-y-1 text-sm">
          {cats.map((c) => (
            <li key={c.id}>
              <Link
                href={c.url}
                className="flex items-center gap-1.5 text-[var(--text)] hover:text-[var(--accent)]"
              >
                {showCatIcons ? (
                  <ServerIcon name={c.icon} size={14} className="text-[var(--accent)]" />
                ) : null}
                {c.name}
              </Link>
            </li>
          ))}
          {cats.length === 0 && <li className="text-[var(--muted)]">暂无分类</li>}
        </ul>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          <Tags size={15} />
          标签
        </h3>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.id}
              href={t.url}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              #{t.name}
            </Link>
          ))}
          {tags.length === 0 && <span className="text-xs text-[var(--muted)]">暂无标签</span>}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          <Clock size={15} />
          最新文章
        </h3>
        <ul className="space-y-2 text-sm">
          {recent.items.map((p) => (
            <li key={p.id}>
              <Link href={p.url} className="text-[var(--text)] hover:text-[var(--accent)]">
                {p.title}
              </Link>
              <p className="text-xs text-[var(--muted)]">{formatDate(p.publishedAt)}</p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
