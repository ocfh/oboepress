import { listPosts } from "@/lib/services/posts";
import { getSettings } from "@/lib/services/settings";
import { getPublishedCount } from "@/lib/services/archives";
import { getActiveTheme } from "@/lib/services/themes";
import PostCard from "@/components/public/PostCard";
import Sidebar from "@/components/public/Sidebar";
import Breadcrumb from "@/components/public/Breadcrumb";
import Pagination from "@/components/public/Pagination";
import WidgetArea from "@/components/public/WidgetArea";
import { loadThemeModule } from "@/themes/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const settings = await getSettings();
  return { title: `文章 - ${settings.siteTitle}` };
}

/**
 * Dedicated blog listing at /blog with numbered pagination. When the active
 * theme supplies its own BlogListPage, the listing renders through the theme
 * so it matches the rest of the site's visual language.
 */
export default async function BlogListing({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const page = Math.max(1, Number(searchParams?.page) || 1);
  const settings = await getSettings();
  const theme = await getActiveTheme();
  const themeModule = await loadThemeModule(theme.slug);

  if (themeModule?.BlogListPage) {
    return <themeModule.BlogListPage page={page} />;
  }

  const perPage = settings.postsPerPage || 12;
  const [{ items, total }, totalPublished] = await Promise.all([
    listPosts({ status: "published", limit: perPage, offset: (page - 1) * perPage }),
    getPublishedCount(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <Breadcrumb items={[{ label: "首页", href: "/" }, { label: "文章" }]} />
        <header className="mb-6 mt-3">
          <h1 className="text-3xl font-bold text-zinc-100">全部文章</h1>
          <p className="mt-1 text-sm text-zinc-500">
            共 {totalPublished} 篇 · 第 {page}/{totalPages} 页
          </p>
        </header>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-zinc-400">
            还没有已发布的文章。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          hrefFor={(p) => (p === 1 ? "/blog" : `/blog?page=${p}`)}
        />

        <WidgetArea themeSlug={theme.slug} area="blog-bottom" />
      </div>
      <Sidebar />
    </div>
  );
}