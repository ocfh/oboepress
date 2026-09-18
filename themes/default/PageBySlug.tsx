import { notFound } from "next/navigation";
import { getPageBySlug, incrementViews } from "@/lib/services/pages";
import { getSettings } from "@/lib/services/settings";
import { renderContent } from "@/lib/services/render";
// 评论仅文章页渲染：经客户端懒边界 CommentsLazy 切成独立 chunk，
// 首页/列表页不下载（RSC 直接 dynamic 保留 SSR 会被合入路由共享块）。
import Comments from "@/components/shared/CommentsLazy";

export const dynamic = "force-dynamic";

/**
 * OboePress default page view.
 */
export default async function OboePressPageBySlug({ params }: { params: { slug: string } }) {
  let page;
  try {
    page = await getPageBySlug(params.slug);
  } catch {
    notFound();
  }

  try {
    await incrementViews(page.id);
  } catch {
    /* noop */
  }

  const settings = await getSettings();
  const html = await renderContent(page.content, {
    kind: "page",
    slug: page.slug,
    siteTitle: settings.siteTitle,
  });
  // Plugin <head> nodes are emitted once by the public catch-all page.

  return (
    <>
      <div className="mx-auto max-w-3xl">
        <article>
          <h1 className="text-3xl font-bold leading-tight text-zinc-100">{page.title}</h1>
          <div className="prose-cms mt-8" dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <Comments
          postId={page.id}
          postType="page"
          open={page.commentStatus === "open"}
          requireNameEmail={settings.requireNameEmail}
        />
      </div>
    </>
  );
}
