import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  Files,
  MessageSquare,
  Images,
  Folder,
  Tags,
  Users,
  PenSquare,
  TrendingUp,
  Clock,
  ArrowRight,
} from "lucide-react";
import { getDashboardStats } from "@/lib/services/dashboard";
import { HOOKS, applyAsyncFilters } from "@/lib/hooks";
import type { DashboardCardItem } from "@/lib/admin-extensions";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};
const commentStatusLabel: Record<string, string> = {
  published: "已发布",
  pending: "待审核",
  spam: "垃圾",
};

export default async function Dashboard() {
  const stats = await getDashboardStats();
  const { cards: pluginCards } = await applyAsyncFilters(HOOKS.dashboardCards, {
    cards: [] as DashboardCardItem[],
  });

  const cards = [
    { label: "文章", value: stats.counts.posts, href: "/admin/posts", icon: FileText },
    { label: "页面", value: stats.counts.pages, href: "/admin/pages", icon: Files },
    { label: "评论", value: stats.counts.comments, href: "/admin/comments", icon: MessageSquare, sub: `${stats.counts.commentsPending} 条待审` },
    { label: "媒体", value: stats.counts.media, href: "/admin/media", icon: Images },
    { label: "分类", value: stats.counts.categories, href: "/admin/categories", icon: Folder },
    { label: "标签", value: stats.counts.tags, href: "/admin/tags", icon: Tags },
    { label: "用户", value: stats.counts.users, href: "/admin/users", icon: Users },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <LayoutDashboard size={22} />
          </span>
          <h1 className="text-2xl font-bold">仪表盘</h1>
        </div>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <PenSquare size={16} />
          写新文章
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-indigo-500 hover:bg-zinc-800/40"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 transition group-hover:bg-indigo-600 group-hover:text-white">
                  <Icon size={18} />
                </span>
                {card.sub && (
                  <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-xs text-amber-400">
                    {card.sub}
                  </span>
                )}
              </div>
              <p className="mt-3 text-3xl font-bold">{card.value}</p>
              <p className="mt-1 text-sm text-zinc-400">{card.label}</p>
            </Link>
          );
        })}
      </div>

      {pluginCards.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pluginCards.map((card, i) => {
            const inner = (
              <div className="group h-full rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-indigo-500 hover:bg-zinc-800/40">
                <p className="text-3xl font-bold">{card.value}</p>
                <p className="mt-1 text-sm text-zinc-400">{card.label}</p>
                {card.sub && (
                  <p className="mt-1 text-xs text-zinc-500">{card.sub}</p>
                )}
              </div>
            );
            return card.href ? (
              <Link
                key={card.label + i}
                href={card.href}
                className="block"
              >
                {inner}
              </Link>
            ) : (
              <div key={card.label + i}>{inner}</div>
            );
          })}
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {/* 文章状态分布 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center gap-2 text-zinc-200">
            <TrendingUp size={18} className="text-indigo-400" />
            <h2 className="text-lg font-semibold">文章状态</h2>
          </div>
          <div className="mt-4 space-y-3">
            {(["draft", "published", "archived"] as const).map((s) => {
              const v = stats.postStatus[s];
              const total = stats.counts.posts || 1;
              return (
                <div key={s}>
                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>{statusLabel[s]}</span>
                    <span>{v}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${(v / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 最近评论 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center gap-2 text-zinc-200">
            <MessageSquare size={18} className="text-indigo-400" />
            <h2 className="text-lg font-semibold">最近评论</h2>
          </div>
          {stats.recentComments.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">暂无评论</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {stats.recentComments.map((c) => (
                <li key={c.id} className="border-b border-zinc-800 pb-3 last:border-0">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>{c.authorName} · 于《{c.postTitle}》</span>
                    <span
                      className={
                        c.status === "pending"
                          ? "text-amber-400"
                          : c.status === "spam"
                            ? "text-red-400"
                            : "text-green-400"
                      }
                    >
                      {commentStatusLabel[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-300">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 最近文章 */}
      <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-200">
            <Clock size={18} className="text-indigo-400" />
            <h2 className="text-lg font-semibold">最近文章</h2>
          </div>
          <Link href="/admin/posts" className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
            查看全部 <ArrowRight size={14} />
          </Link>
        </div>
        {stats.recentPosts.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">还没有文章</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">标题</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {stats.recentPosts.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">
                    <Link href={`/admin/posts/${p.id}`} className="inline-flex items-center gap-2 text-zinc-200 hover:text-indigo-300">
                      <FileText size={15} className="text-zinc-500" />
                      {p.title}
                    </Link>
                  </td>
                  <td className="py-2 text-zinc-400">{statusLabel[p.status as "draft" | "published" | "archived"]}</td>
                  <td className="py-2 text-xs text-zinc-500">
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleString("zh-CN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">API 接入</h2>
        <p className="mt-2 text-sm text-zinc-400">本系统提供 REST 与 GraphQL 两种接口：</p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-300">
          <li>
            REST: <code className="text-indigo-300">GET /api/posts?status=published</code>
          </li>
          <li>
            GraphQL: <code className="text-indigo-300">POST /api/graphql</code>（浏览器访问可打开 Playground）
          </li>
          <li>
            订阅源: <code className="text-indigo-300">GET /feed.xml</code> · 站点地图:{" "}
            <code className="text-indigo-300">GET /sitemap.xml</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
