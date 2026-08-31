import type { Metadata } from "next";
import { getActiveTheme } from "@/lib/services/themes";
import { getPageBySlug } from "@/lib/services/pages";
import { loadThemeModule } from "@/themes/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const decoded = safeDecode(params.slug);
  try {
    const page = await getPageBySlug(decoded);
    // SEO 标题去掉「 · 」后的副标题，只保留主标题
    return { title: page.title.split(" · ")[0] };
  } catch {
    return {};
  }
}

export default async function PageBySlug({ params }: { params: { slug: string } }) {
  const theme = await getActiveTheme();
  const themeModule = await loadThemeModule(theme.slug);
  const decodedSlug = safeDecode(params.slug);
  const decodedParams = { ...params, slug: decodedSlug };

  if (!themeModule) {
    const fallback = await loadThemeModule("oboepress-2026");
    if (fallback) return <fallback.PageBySlug params={decodedParams} />;
    return <div>无法加载主题</div>;
  }

  return <themeModule.PageBySlug params={decodedParams} />;
}

/** Next app-router passes non-ASCII dynamic segments URI-encoded; decode once. */
function safeDecode(slug: string): string {
  if (/%[0-9A-Fa-f]{2}/.test(slug)) {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  }
  return slug;
}
