import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { getSettings } from "@/lib/services/settings";
import { getActiveTheme, getActiveThemeRenderConfig } from "@/lib/services/themes";
import { themeToCss } from "@/lib/theme";
import { loadThemeModule } from "@/themes/registry";
import { buildFooterHtml } from "@/lib/services/render";
import { buildSiteMetadata, analyticsSnippet } from "@/lib/services/seo";
import { getAdminSecurity } from "@/lib/services/security";
import RawInjection from "@/components/RawInjection";

export const dynamic = "force-dynamic";

/**
 * 伪装上下文（伪装开启后的整棵 /admin，或秘密入口路径）下不得输出任何基于
 * 站点设置的 metadata：siteTitle 会进入 <title> 与 RSC flight payload，
 * 匿名访客拿到 404 时就能据此识别站点程序。命中时调用方走最小 metadata。
 */
async function isDisguisedContext(pathname: string): Promise<boolean> {
  const sec = await getAdminSecurity();
  if (!sec.entryEnabled) return false;
  return pathname.startsWith("/admin") || pathname === sec.entryPath;
}

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (
    headers().get("x-invoke-path") ??
    headers().get("next-url") ??
    ""
  ).split("?")[0];
  if (await isDisguisedContext(pathname)) {
    // 不调 getSettings：无 title default/template、无 description/OG，
    // 页面名由子段用 absolute title 自行提供（见 admin/not-found.tsx）。
    return { robots: { index: false, follow: false } };
  }
  const settings = await getSettings();
  return buildSiteMetadata(settings);
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hdrs = headers();
  const pathname = (
    hdrs.get("x-invoke-path") ??
    hdrs.get("next-url") ??
    ""
  ).split("?")[0];
  const isAdmin = pathname.startsWith("/admin");

  // 伪装后的登录入口由前台 catch-all 渲染，但必须同样使用无主题的极简
  // 深色外壳，因此这里按 options 配置识别秘密路径。
  let isEntry = false;
  if (!isAdmin) {
    const sec = await getAdminSecurity();
    isEntry = sec.entryEnabled && pathname === sec.entryPath;
  }

  // Admin routes (and the disguised login entry): plain dark shell, no theme.
  if (isAdmin || isEntry) {
    return (
      <html lang="zh-CN">
        <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
          {children}
        </body>
      </html>
    );
  }

  // Public routes: load active theme and inject CSS variables.
  const [settings, theme, renderConfig] = await Promise.all([
    getSettings(),
    getActiveTheme(),
    getActiveThemeRenderConfig(),
  ]);
  const css = themeToCss(renderConfig);
  const themeModule =
    (await loadThemeModule(theme.slug)) ??
    (await loadThemeModule("default"));
  // Plugins that ship footer markup (e.g. code-copy) are injected here so they
  // run on every public page regardless of which theme is active.
  const footerHtml = await buildFooterHtml();
  // Site-wide custom code: head injection at body open, footer injection plus
  // analytics at body end. RawInjection keeps the markup in SSR source (so
  // crawlers see it) and clones <script> nodes so they actually execute.
  const headInject = settings.customHead || "";
  const footInject = [footerHtml, settings.customFooter, analyticsSnippet(settings)]
    .filter(Boolean)
    .join("\n");

  if (!themeModule) {
    return (
      <html lang="zh-CN">
        <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
          <style id="oboe-theme" dangerouslySetInnerHTML={{ __html: `:root{${css}}` }} />
          {settings.customCss ? (
            <style id="oboe-custom-css" dangerouslySetInnerHTML={{ __html: settings.customCss }} />
          ) : null}
          {headInject ? <RawInjection html={headInject} /> : null}
          <div>无法加载主题</div>
          {footInject ? <RawInjection id="oboe-footer-hooks" html={footInject} /> : null}
        </body>
      </html>
    );
  }

  const PublicLayout = themeModule.PublicLayout;
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <style id="oboe-theme" dangerouslySetInnerHTML={{ __html: `:root{${css}}` }} />
        {settings.customCss ? (
          <style id="oboe-custom-css" dangerouslySetInnerHTML={{ __html: settings.customCss }} />
        ) : null}
        {headInject ? <RawInjection html={headInject} /> : null}
        <PublicLayout siteTitle={settings.siteTitle}>{children}</PublicLayout>
        {footInject ? <RawInjection id="oboe-footer-hooks" html={footInject} /> : null}
      </body>
    </html>
  );
}
