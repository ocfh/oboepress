import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, User, Calendar, Eye } from "lucide-react";
import { getSettings } from "@/lib/services/settings";
import { getMenuByLocation } from "@/lib/services/menus";
import { listPosts } from "@/lib/services/posts";
import { getPostBySlug, incrementViews } from "@/lib/services/posts";
import { getPageBySlug } from "@/lib/services/pages";
import { getThemeSettings, getThemeBySlug } from "@/lib/services/themes";
import { isOn } from "@/lib/theme";
import { serializeBlocks } from "@/lib/blocks";
import { formatDate } from "@/lib/utils";
import NavTree from "@/components/public/NavTree";
import Sidebar from "@/components/public/Sidebar";
import PostCard from "@/components/public/PostCard";
import Breadcrumb from "@/components/public/Breadcrumb";
import PostToc from "@/components/public/PostToc";
import ShareButtons from "@/components/public/ShareButtons";
import RelatedPosts from "@/components/public/RelatedPosts";
import Comments from "@/components/public/Comments";
import WidgetArea from "@/components/public/WidgetArea";

/**
 * Shared page engine used by the built-in themes.
 *
 * Every theme reuses these four server components; their *visual identity*
 * comes entirely from the ThemeConfig tokens (--bg, --accent, --radius, …)
 * plus per-theme customCss, so a single engine yields six distinct looks.
 * `variant` switches a few structural details (header alignment, logo style)
 * without duplicating markup.
 */

export type ThemeVariant = "default" | "centered" | "minimal" | "neon";

async function shellData() {
  const [settings, header, footer] = await Promise.all([
    getSettings(),
    getMenuByLocation("header"),
    getMenuByLocation("footer"),
  ]);
  return { settings, header, footer };
}

export async function SharedLayout({
  themeSlug,
  variant = "default",
  children,
}: {
  themeSlug: string;
  variant?: ThemeVariant;
  children: React.ReactNode;
}) {
  const { settings, header, footer } = await shellData();
  const theme = await getThemeBySlug(themeSlug);
  const glassOn = isOn(theme?.config?.glass);
  const glassBlur = (theme?.config?.glassBlur as string) || "12px";
  const centered = variant === "centered";
  const neon = variant === "neon";

  return (
    <div className="theme-root flex min-h-screen flex-col">
      <header
        className={`sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--header-bg)] ${
          glassOn ? "backdrop-blur" : ""
        }`}
        style={glassOn ? { backdropFilter: `blur(${glassBlur})` } : undefined}
      >
        <div
          className={`mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 ${
            centered ? "flex-col text-center" : ""
          }`}
        >
          <Link
            href="/"
            className={`flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-100 ${
              centered ? "justify-center" : ""
            }`}
          >
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt={settings.siteTitle} className="h-7 w-auto" />
            ) : (
              <>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                  style={{
                    background: neon ? "var(--gradient)" : "var(--accent)",
                    backgroundImage: neon ? "var(--gradient)" : undefined,
                  }}
                >
                  {settings.siteTitle.slice(0, 1).toUpperCase()}
                </span>
                <span style={neon ? { backgroundImage: "var(--gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : undefined}>
                  {settings.siteTitle}
                </span>
              </>
            )}
          </Link>
          <nav className={`${centered ? "mt-2" : "ml-2 hidden flex-1 md:block"}`}>
            <NavTree nodes={header?.items ?? []} className="flex flex-wrap items-center" />
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

      <WidgetArea themeSlug={themeSlug} area="footer" className="mx-auto w-full max-w-5xl px-4" />

      <footer className="border-t border-[var(--border)] bg-[var(--footer-bg)] px-4 py-8">
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

export async function SharedHome({ themeSlug }: { themeSlug: string }) {
  const [posts, settings, themeOpts] = await Promise.all([
    listPosts({ status: "published", limit: 12 }),
    getSettings(),
    getThemeSettings(themeSlug),
  ]);
  const items = posts.items;
  const showFeatured = themeOpts.showFeatured !== false;
  const featured = showFeatured ? items[0] : undefined;
  const rest = showFeatured ? items.slice(1) : items;

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[var(--radius-large)] border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--bg)] px-8 py-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-100">{settings.siteTitle}</h1>
        {settings.tagline && <p className="mt-3 text-base text-zinc-400">{settings.tagline}</p>}
        {settings.siteDescription && (
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-500">{settings.siteDescription}</p>
        )}
      </section>

      <WidgetArea themeSlug={themeSlug} area="home-top" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          {items.length === 0 ? (
            <p className="rounded-[var(--radius-large)] border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-zinc-400">
              还没有已发布的文章。
            </p>
          ) : (
            <div className="space-y-6">
              {featured && (
                <article className="group overflow-hidden rounded-[var(--radius-large)] border border-[var(--border)] bg-[var(--surface)]">
                  {featured.featuredImage && (
                    <Link href={`/blog/${featured.slug}`} className="block aspect-[21/9] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={featured.featuredImage}
                        alt={featured.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </Link>
                  )}
                  <div className="p-6">
                    <div className="mb-2 flex flex-wrap gap-2 text-xs">
                      {featured.categories.slice(0, 3).map((c) => (
                        <Link
                          key={c.id}
                          href={`/blog/category/${c.slug}`}
                          className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-[var(--accent)]"
                        >
                          {c.name}
                        </Link>
                      ))}
                    </div>
                    <h2 className="text-2xl font-bold leading-snug text-zinc-100">
                      <Link
                        href={`/blog/${featured.slug}`}
                        className="transition group-hover:text-[var(--accent)]"
                      >
                        {featured.title}
                      </Link>
                    </h2>
                    {featured.excerpt && (
                      <p className="mt-3 line-clamp-3 text-sm text-zinc-400">{featured.excerpt}</p>
                    )}
                  </div>
                </article>
              )}

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {rest.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}
        </div>
        <Sidebar />
      </div>
    </div>
  );
}

export async function SharedPost({
  themeSlug,
  params,
}: {
  themeSlug: string;
  params: { slug: string };
}) {
  let post;
  try {
    post = await getPostBySlug(params.slug);
  } catch {
    notFound();
  }

  try {
    await incrementViews(post.id);
  } catch {
    /* noop */
  }

  const settings = await getSettings();
  const themeOpts = await getThemeSettings(themeSlug);
  const html = serializeBlocks(post.content);
  const canonical = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/blog/${post.slug}`;
  const showToc = themeOpts.showToc !== false;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
      <article>
        <header className="mb-6">
          <Breadcrumb
            items={[
              { label: "首页", href: "/" },
              { label: "文章", href: "/blog" },
              ...post.categories.slice(0, 1).map((c) => ({
                label: c.name,
                href: `/blog/category/${c.slug}`,
              })),
              { label: post.title },
            ]}
          />
          <div className="mb-3 mt-3 flex flex-wrap gap-2 text-xs">
            {post.categories.map((c) => (
              <Link
                key={c.id}
                href={`/blog/category/${c.slug}`}
                className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-[var(--accent)]"
              >
                {c.name}
              </Link>
            ))}
          </div>
          <h1 className="text-3xl font-bold leading-tight text-zinc-100">{post.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <User size={14} />
              {post.author?.name ?? "未知作者"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} />
              {formatDate(post.publishedAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye size={14} />
              {post.views} 阅读
            </span>
          </div>
        </header>

        {post.featuredImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featuredImage}
            alt={post.title}
            className="mb-6 w-full rounded-[var(--radius-large)] border border-[var(--border)] object-cover"
          />
        )}

        <div className="prose-cms" dangerouslySetInnerHTML={{ __html: html }} />

        {post.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--border)] pt-6">
            {post.tags.map((t) => (
              <Link
                key={t.id}
                href={`/blog/tag/${t.slug}`}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-zinc-300 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                #{t.name}
              </Link>
            ))}
          </div>
        )}

        <ShareButtons title={post.title} url={canonical} />
        <RelatedPosts postId={post.id} />
        <WidgetArea themeSlug={themeSlug} area="post-bottom" />

        <Comments
          postId={post.id}
          postType="post"
          open={post.commentStatus === "open"}
          requireNameEmail={settings.requireNameEmail}
        />
      </article>
      <div className="space-y-6">
        {showToc && <PostToc />}
        <Sidebar />
        <WidgetArea themeSlug={themeSlug} area="sidebar" />
      </div>
    </div>
  );
}

export async function SharedPage({
  themeSlug,
  params,
}: {
  themeSlug: string;
  params: { slug: string };
}) {
  let page;
  try {
    page = await getPageBySlug(params.slug);
  } catch {
    notFound();
  }
  const html = serializeBlocks(page.content);

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: "首页", href: "/" }, { label: page.title }]} />
      <h1 className="mb-6 mt-3 text-4xl font-bold text-zinc-100">{page.title}</h1>
      <div className="prose-cms" dangerouslySetInnerHTML={{ __html: html }} />
      <WidgetArea themeSlug={themeSlug} area="page-bottom" />
    </div>
  );
}
