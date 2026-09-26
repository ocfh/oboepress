import Link from "next/link";
import { redirect } from "next/navigation";
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
  searchParams: { q?: string; page?: string; all?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  // ?all=1 = 用户点了「查看全部结果」，强制展示列表（跳过「唯一命中跳文章」）。
  const showAll = searchParams.all === "1";

  // 维护模式优先于主题搜索页委托，维护期间统一展示维护屏。
  const maintenance = await maintenanceGate();
  if (maintenance) return <MaintenanceScreen settings={maintenance} />;

  const theme = await getActiveTheme();
  const themeModule = await loadThemeModule(theme.slug);
  if (themeModule?.SearchPage) {
    return <themeModule.SearchPage q={q} page={page} all={showAll} />;
  }

  const { items, total } = q
    ? await listPosts({ status: "published", search: q, limit: 20 })
    : { items: [], total: 0 };

  // 唯一命中 → 直接进文章，不展示搜索列表页（与 bluemix 主题 SearchPage 行为一致）。
  // 命中为空、多条，或用户主动「查看全部」时照常渲染列表。
  // 用 total（整站命中数）而非 items.length，避免分页页误判。
  if (q && !showAll && total === 1 && page === 1 && items[0]?.url) {
    // Next 的 redirect() 不接受含非 ASCII 字符的 Location（ERR_INVALID_CHAR），
    // 中文固定链接的文章地址必须先 encodeURI 再跳。
    redirect(encodeURI(items[0].url));
  }

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