import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { getSettings } from "@/lib/services/settings";
import { getActiveTheme } from "@/lib/services/themes";
import { themeToCss } from "@/lib/theme";
import { loadThemeModule } from "@/themes/registry";
import { buildFooterHtml } from "@/lib/services/render";
import { buildSiteMetadata, analyticsSnippet } from "@/lib/services/seo";
import RawInjection from "@/components/RawInjection";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return buildSiteMetadata(settings);
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin =
    headers().get("x-invoke-path")?.startsWith("/admin") ??
    headers().get("next-url")?.startsWith("/admin") ??
    false;

  // Admin routes: plain dark shell — no theme injection.
  if (isAdmin) {
    return (
      <html lang="zh-CN">
        <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
          {children}
        </body>
      </html>
    );
  }

  // Public routes: load active theme and inject CSS variables.
  const [settings, theme] = await Promise.all([
    getSettings(),
    getActiveTheme(),
  ]);
  const css = themeToCss(theme.config);
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
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
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
