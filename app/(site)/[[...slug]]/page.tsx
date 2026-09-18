import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  resolveSitePath,
  getPermalinkConfig,
  blogIndexUrlFor,
  categoryUrlFor,
  tagUrlFor,
  paginate,
  type SitePathResolution,
  type PermalinkConfig,
} from "@/lib/services/links";
import { listPosts } from "@/lib/services/posts";
import { getSettings } from "@/lib/services/settings";
import { getPublishedCount } from "@/lib/services/archives";
import { getActiveTheme, getActiveThemeSettings } from "@/lib/services/themes";
import { buildHeadNodes } from "@/lib/services/render";
import {
  buildEntityMetadata,
  buildHeadContext,
  type SeoTarget,
} from "@/lib/services/seo";
import RawInjection from "@/components/RawInjection";
import PostCard from "@/components/shared/PostCard";
import Sidebar from "@/components/shared/Sidebar";
import Breadcrumb from "@/components/shared/Breadcrumb";
import Pagination from "@/components/shared/Pagination";
import WidgetArea from "@/components/shared/WidgetArea";
import ServerIcon from "@/components/shared/ServerIcon";
import { loadThemeModule } from "@/themes/registry";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: { slug?: string[] };
  searchParams?: { page?: string };
};

/**
 * The single public content entry point. Every entity URL (home, post index,
 * posts, pages, categories, tags) is resolved through the permalink gateway,
 * so renaming or deleting a prefix in 后台 → 固定链接 rewires the whole site
 * without touching the file tree. Static segments (/search, /archives,
 * /feed.xml, /sitemap.xml, /admin, /api) keep their concrete routes, which
 * take precedence over this optional catch-all.
 */

/** Normalize a resolved route into the shared SEO target shape. */
function seoTargetFor(res: SitePathResolution, cfg: PermalinkConfig): SeoTarget {
  switch (res.kind) {
    case "post":
      return {
        kind: "post",
        title: res.post.title,
        seoTitle: res.post.seoTitle,
        seoDescription: res.post.seoDescription,
        seoKeywords: res.post.seoKeywords,
        excerpt: res.post.excerpt,
        image: res.post.featuredImage,
        url: res.post.url,
        publishedAt: res.post.publishedAt,
        updatedAt: res.post.updatedAt,
        authorName: res.post.author?.name,
      };
    case "page":
      return {
        kind: "page",
        title: res.page.title,
        seoTitle: res.page.seoTitle,
        seoDescription: res.page.seoDescription,
        seoKeywords: res.page.seoKeywords,
        excerpt: res.page.excerpt,
        image: res.page.featuredImage,
        url: res.page.url,
        publishedAt: res.page.publishedAt,
        updatedAt: res.page.updatedAt,
      };
    case "category":
      return {
        kind: "category",
        title: res.category.name,
        excerpt: res.category.description,
        url: categoryUrlFor(cfg, res.category),
      };
    case "tag":
      return {
        kind: "tag",
        title: res.tag.name,
        url: tagUrlFor(cfg, res.tag),
      };
    case "blogIndex":
      return { kind: "blogIndex", title: "文章", url: blogIndexUrlFor(cfg) };
    case "home":
      return { kind: "home" };
  }
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const [res, settings, cfg] = await Promise.all([
    resolveSitePath(params.slug ?? []),
    getSettings(),
    getPermalinkConfig(),
  ]);
  if (!res) return {};
  return buildEntityMetadata(seoTargetFor(res, cfg), settings);
}

export default async function SiteCatchAll({ params, searchParams }: RouteProps) {
  const [res, settings, cfg] = await Promise.all([
    resolveSitePath(params.slug ?? []),
    getSettings(),
    getPermalinkConfig(),
  ]);
  if (!res) notFound();

  const theme = await getActiveTheme();
  const themeModule = (await loadThemeModule(theme.slug)) ?? (await loadThemeModule("default"));
  if (!themeModule) return <div>无法加载主题</div>;

  // Plugins emit <head> nodes (e.g. seo-schema JSON-LD) exactly once per
  // route here; individual themes must not call buildHeadNodes themselves.
  const target = seoTargetFor(res, cfg);
  const headNodes = await buildHeadNodes(buildHeadContext(target, settings));
  const headHooks = headNodes.length ? (
    <RawInjection html={headNodes.join("\n")} id="oboe-head-hooks" />
  ) : null;

  let content: ReactNode = null;

  switch (res.kind) {
    case "home":
      content = <themeModule.HomePage />;
      break;

    case "post":
      // Theme components re-fetch by the *stored* slug; the URL tail may be
      // an id / pinyin / initials, so hand them the canonical stored value.
      content = <themeModule.PostPage params={{ slug: res.post.slug }} />;
      break;

    case "page":
      content = <themeModule.PageBySlug params={{ slug: res.page.slug }} />;
      break;

    case "blogIndex": {
      const page = Math.max(1, Number(searchParams?.page) || 1);
      if (themeModule.BlogListPage) {
        content = <themeModule.BlogListPage page={page} />;
        break;
      }
      const perPage = settings.postsPerPage || 12;
      const indexPath = blogIndexUrlFor(cfg);
      const [{ items, total }, totalPublished] = await Promise.all([
        listPosts({ status: "published", limit: perPage, offset: (page - 1) * perPage }),
        getPublishedCount(),
      ]);
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      content = (
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
              hrefFor={(p) => paginate(indexPath, p)}
            />
            <WidgetArea themeSlug={theme.slug} area="blog-bottom" />
          </div>
          <Sidebar />
        </div>
      );
      break;
    }

    case "category": {
      const category = res.category;
      if (themeModule.CategoryPage) {
        content = <themeModule.CategoryPage slug={category.slug} />;
        break;
      }
      const [{ items }, ts] = await Promise.all([
        listPosts({ status: "published", categorySlug: category.slug, limit: 12 }),
        getActiveThemeSettings(),
      ]);
      const showCatIcon = ts.useCustomIcons === true && !!category.icon;
      content = (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="mb-6">
              <Link href="/" className="text-sm text-zinc-400 hover:text-[var(--accent)]">
                ← 首页
              </Link>
              <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-zinc-100">
                {showCatIcon ? (
                  <ServerIcon name={category.icon ?? ""} size={22} className="text-[var(--accent)]" />
                ) : null}
                分类：{category.name}
              </h1>
              {category.description && (
                <p className="mt-2 text-sm text-zinc-400">{category.description}</p>
              )}
            </div>
            {items.length === 0 ? (
              <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-zinc-400">
                该分类下还没有文章。
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
      break;
    }

    case "tag": {
      const tag = res.tag;
      const { items } = await listPosts({ status: "published", tagSlug: tag.slug, limit: 12 });
      content = (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="mb-6">
              <Link href="/" className="text-sm text-zinc-400 hover:text-[var(--accent)]">
                ← 首页
              </Link>
              <h1 className="mt-2 text-3xl font-bold text-zinc-100">标签：#{tag.name}</h1>
            </div>
            {items.length === 0 ? (
              <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-zinc-400">
                该标签下还没有文章。
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
      break;
    }
  }

  return (
    <>
      {headHooks}
      {content}
    </>
  );
}
