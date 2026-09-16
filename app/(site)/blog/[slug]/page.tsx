import type { Metadata } from "next";
import { getActiveTheme } from "@/lib/services/themes";
import { getPostBySlug } from "@/lib/services/posts";
import { loadThemeModule } from "@/themes/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const decoded = safeDecode(params.slug);
  try {
    const post = await getPostBySlug(decoded);
    // SEO 标题去掉「 · 」后的副标题，只保留主标题
    return { title: post.title.split(" · ")[0] };
  } catch {
    return {};
  }
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const theme = await getActiveTheme();
  const themeModule = await loadThemeModule(theme.slug);
  const decodedSlug = safeDecode(params.slug);

  if (!themeModule) {
    const fallback = await loadThemeModule("default");
    if (fallback) return <fallback.PostPage params={{ ...params, slug: decodedSlug }} />;
    return <div>无法加载主题</div>;
  }

  return <themeModule.PostPage params={{ ...params, slug: decodedSlug }} />;
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
