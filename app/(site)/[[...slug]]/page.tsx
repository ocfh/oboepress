import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAdminSecurity } from "@/lib/services/security";
import { maintenanceGate } from "@/lib/services/maintenance";
import MaintenanceScreen from "@/components/site/MaintenanceScreen";
import { getPublicRegisterConfig } from "@/lib/services/members";
import { getPublicProviders } from "@/lib/services/oauth";
import OAuthButtons from "@/components/shared/OAuthButtons";
import AdminLogin from "@/components/admin/AdminLoginLazy";
import RegisterForm, { type RegisterConfig } from "@/components/site/RegisterFormLazy";
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
import VirtualRoutePage from "@/components/site/VirtualRoutePage";
import { resolveVirtualRoute } from "@/lib/services/virtual-routes";
import {
  renderUserCenter,
  renderUserCenterGuest,
} from "@/lib/services/user-center";
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
        seoTitle: res.category.seoTitle,
        seoDescription: res.category.seoDescription,
        seoKeywords: res.category.seoKeywords,
        excerpt: res.category.description,
        url: categoryUrlFor(cfg, res.category),
      };
    case "tag":
      return {
        kind: "tag",
        title: res.tag.name,
        seoTitle: res.tag.seoTitle,
        seoDescription: res.tag.seoDescription,
        seoKeywords: res.tag.seoKeywords,
        url: tagUrlFor(cfg, res.tag),
      };
    case "blogIndex":
      return { kind: "blogIndex", title: "文章", url: blogIndexUrlFor(cfg) };
    case "home":
      return { kind: "home" };
  }
}

/** catch-all 未命中任何实体时，检查该路径是否为伪装的后台登录入口。 */
async function resolveSecretEntry(slug: string[]): Promise<boolean> {
  const sec = await getAdminSecurity();
  if (!sec.entryEnabled) return false;
  const tail = "/" + slug.join("/");
  return tail === sec.entryPath;
}

/** 同上，检查是否为开启状态下的会员注册路径；关闭或不匹配返回 null。 */
async function resolveRegisterPage(slug: string[]): Promise<RegisterConfig | null> {
  const cfg = await getPublicRegisterConfig();
  if (!cfg.enabled || cfg.path !== "/" + slug.join("/")) return null;
  return cfg;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const segments = params.slug ?? [];
  const [res, settings, cfg] = await Promise.all([
    resolveSitePath(segments),
    getSettings(),
    getPermalinkConfig(),
  ]);
  if (!res) {
    if (await resolveSecretEntry(segments)) {
      // 登录入口不进任何索引。
      return { title: "登录", robots: { index: false, follow: false } };
    }
    if (await resolveRegisterPage(segments)) {
      return { title: "注册", robots: { index: false, follow: false } };
    }
    // 前台用户中心 /me：个人页不进索引。
    if (segments.length === 1 && segments[0] === "me") {
      return { title: "用户中心", robots: { index: false, follow: false } };
    }
    // 插件虚拟路由（如 friend-links 的 /links）：按普通页面输出 SEO 元数据。
    const virtual = await resolveVirtualRoute(segments);
    if (virtual) {
      return buildEntityMetadata(
        {
          kind: "page",
          title: virtual.title,
          seoTitle: virtual.seoTitle,
          seoDescription: virtual.seoDescription,
          seoKeywords: virtual.seoKeywords,
          url: virtual.path,
        },
        settings,
      );
    }
    return {};
  }
  return buildEntityMetadata(seoTargetFor(res, cfg), settings);
}

export default async function SiteCatchAll({ params, searchParams }: RouteProps) {
  const segments = params.slug ?? [];
  const [res, settings, cfg] = await Promise.all([
    resolveSitePath(segments),
    getSettings(),
    getPermalinkConfig(),
  ]);

  // 未命中实体：可能是伪装后的后台登录入口，或开启中的会员注册页。
  // 已登录用户误入登录入口直接进后台；注册页沿用公开主题外壳，已登录
  // 用户（含会员）访问则回首页，避免重复注册。其余路径照旧 404。
  if (!res) {
    const [isEntry, registerCfg] = await Promise.all([
      resolveSecretEntry(segments),
      resolveRegisterPage(segments),
    ]);
    if (isEntry) {
      const user = await getSession();
      if (user) redirect("/admin");
      return <AdminLogin />;
    }
    if (registerCfg) {
      const [user, oauthProviders] = await Promise.all([
        getSession(),
        getPublicProviders(),
      ]);
      if (user) redirect("/");
      return (
        <div className="flex justify-center py-12">
          <div
            className="w-full max-w-md rounded-2xl border bg-white/85 p-8 shadow-sm backdrop-blur"
            style={{ borderColor: "var(--border-color)" }}
          >
            <h1
              className="mb-6 text-center text-2xl font-bold"
              style={{ color: "var(--text-color)" }}
            >
              注册账号
            </h1>
            <RegisterForm config={registerCfg} />
            <OAuthButtons providers={oauthProviders} variant="light" />
          </div>
        </div>
      );
    }
    // 前台用户中心：已登录显示资料与插件入口，游客显示登录卡。
    if (segments.length === 1 && segments[0] === "me") {
      const meUser = await getSession();
      const route = meUser
        ? await renderUserCenter(meUser)
        : await renderUserCenterGuest();
      return <VirtualRoutePage route={route} />;
    }
    // 插件虚拟路由（如 friend-links 的 /links）：仍无人认领才落到 404。
    // 与秘密入口/注册页同级，不经维护模式拦截（维护中站长也需对外开关控制）。
    const virtual = await resolveVirtualRoute(segments);
    if (virtual) return <VirtualRoutePage route={virtual} />;
    notFound();
  }

  // 维护模式：仅对实体内容路由生效；上面的秘密入口 / 注册页分支不受影响。
  const maintenance = await maintenanceGate();
  if (maintenance) return <MaintenanceScreen settings={maintenance} />;

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
      const archivePage = Math.max(1, Number(searchParams?.page) || 1);
      if (themeModule.CategoryPage) {
        content = <themeModule.CategoryPage slug={category.slug} page={archivePage} />;
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
      const tagPage = Math.max(1, Number(searchParams?.page) || 1);
      if (themeModule.TagPage) {
        content = <themeModule.TagPage slug={tag.slug} page={tagPage} />;
        break;
      }
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
