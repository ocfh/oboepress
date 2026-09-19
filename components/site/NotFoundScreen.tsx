import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";
import { listPosts } from "@/lib/services/posts";
import type { NotFoundSettings } from "@/lib/services/not-found-config";

/**
 * 自定义 404 屏（服务端组件）：标题 / 文案可在后台配置，可开关搜索框与
 * 最近文章。配色沿用主题 CSS 变量，由 app/not-found.tsx 在根布局内渲染，
 * 因此自动带主题页头页脚。
 */
export default async function NotFoundScreen({
  settings,
}: {
  settings: NotFoundSettings;
}) {
  const recent = settings.showRecent
    ? (await listPosts({ status: "published", limit: 6 })).items
    : [];
  const lines = settings.message
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="flex justify-center px-4 py-16">
      <div className="w-full max-w-xl text-center">
        <span
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border"
          style={{
            borderColor: "var(--primary-color, var(--accent, #1f8bff))",
            color: "var(--primary-color, var(--accent, #1f8bff))",
          }}
        >
          <Compass size={30} />
        </span>

        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--text-color, var(--text, #1f2937))" }}
        >
          {settings.title}
        </h1>

        <div
          className="mt-3 space-y-1 text-sm leading-6"
          style={{ color: "var(--muted-color, var(--muted, #6b7280))" }}
        >
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        {settings.showSearch && (
          <form action="/search" className="mx-auto mt-7 flex max-w-md gap-2">
            <input
              type="search"
              name="q"
              placeholder="搜索文章…"
              aria-label="搜索文章"
              className="h-10 flex-1 rounded-full border px-4 text-sm outline-none"
              style={{
                borderColor: "var(--border-color, var(--border, #e5e7eb))",
                background: "var(--surface-color, var(--surface, #fff))",
                color: "var(--text-color, var(--text, #1f2937))",
              }}
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-medium text-white"
              style={{ background: "var(--primary-color, var(--accent, #1f8bff))" }}
            >
              <Search size={15} />
              搜索
            </button>
          </form>
        )}

        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: "var(--primary-color, var(--accent, #1f8bff))" }}
          >
            <Home size={15} />
            返回首页
          </Link>
        </div>

        {recent.length > 0 && (
          <div
            className="mt-10 rounded-2xl border p-6 text-left"
            style={{
              borderColor: "var(--border-color, var(--border, #e5e7eb))",
              background: "var(--surface-color, var(--surface, #fff))",
            }}
          >
            <h2
              className="mb-3 text-sm font-semibold"
              style={{ color: "var(--text-color, var(--text, #1f2937))" }}
            >
              最近文章
            </h2>
            <ul className="space-y-2">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={p.url}
                    className="block truncate text-sm hover:underline"
                    style={{ color: "var(--muted-color, var(--muted, #6b7280))" }}
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
