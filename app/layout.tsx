import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { getSettings } from "@/lib/services/settings";
import { getActiveTheme } from "@/lib/services/themes";
import { themeToCss } from "@/lib/theme";
import { loadThemeModule } from "@/themes/registry";
import { buildFooterHtml } from "@/lib/services/render";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: { default: settings.siteTitle, template: `%s | ${settings.siteTitle}` },
    description: settings.siteDescription,
  };
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
    (await loadThemeModule("oboepress-2026"));
  // Plugins that ship footer markup (e.g. code-copy) are injected here so they
  // run on every public page regardless of which theme is active.
  const footerHtml = await buildFooterHtml();

  if (!themeModule) {
    return (
      <html lang="zh-CN">
        <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
          <style id="oboe-theme" dangerouslySetInnerHTML={{ __html: `:root{${css}}` }} />
          <div>无法加载主题</div>
          {footerHtml ? (
            <div dangerouslySetInnerHTML={{ __html: footerHtml }} />
          ) : null}
        </body>
      </html>
    );
  }

  const PublicLayout = themeModule.PublicLayout;
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <style id="oboe-theme" dangerouslySetInnerHTML={{ __html: `:root{${css}}` }} />
        <PublicLayout siteTitle={settings.siteTitle}>{children}</PublicLayout>
        {footerHtml ? (
          <div id="oboe-footer-hooks" dangerouslySetInnerHTML={{ __html: footerHtml }} />
        ) : null}
      </body>
    </html>
  );
}
