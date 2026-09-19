import Link from "next/link";
import { Search, ArrowLeft } from "lucide-react";
import { listPosts } from "@/lib/services/posts";
import { getActiveTheme } from "@/lib/services/themes";
import { maintenanceGate } from "@/lib/services/maintenance";
import MaintenanceScreen from "@/components/site/MaintenanceScreen";
import PostCard from "@/components/shared/PostCard";
import Sidebar from "@/components/shared/Sidebar";
import { loadThemeModule } from "@/themes/registry";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();

  // 维护模式优先于主题搜索页委托，维护期间统一展示维护屏。
  const maintenance = await maintenanceGate();
  if (maintenance) return <MaintenanceScreen settings={maintenance} />;

  const theme = await getActiveTheme();
  const themeModule = await loadThemeModule(theme.slug);
  if (themeModule?.SearchPage) {
    return <themeModule.SearchPage q={q} />;
  }

  const { items } = q
    ? await listPosts({ status: "published", search: q, limit: 20 })
    : { items: [] };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-[var(--accent)]">
            <ArrowLeft size={14} />
            首页
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-zinc-100">
            <Search size={26} className="text-[var(--accent)]" />
            {q ? `搜索：“${q}”` : "搜索"}
          </h1>
          {q && <p className="mt-2 text-sm text-zinc-400">找到 {items.length} 篇结果</p>}
        </div>
        {q && items.length === 0 ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-zinc-400">
            没有匹配的文章。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
      <Sidebar />
    </div>
  );
}