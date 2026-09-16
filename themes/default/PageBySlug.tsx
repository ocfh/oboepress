import { notFound } from "next/navigation";
import { getPageBySlug, incrementViews } from "@/lib/services/pages";
import { getSettings } from "@/lib/services/settings";
import { renderContent, buildHeadNodes } from "@/lib/services/render";
import Comments from "@/components/public/Comments";

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
  const canonical = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/pages/${page.slug}`;
  const html = await renderContent(page.content, {
    kind: "page",
    slug: page.slug,
    siteTitle: settings.siteTitle,
  });
  const heads = await buildHeadNodes({
    kind: "page",
    siteTitle: settings.siteTitle,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "",
    title: page.title,
    description: page.excerpt ?? "",
    url: canonical,
  });

  return (
    <>
      {heads.length > 0 && (
        <div dangerouslySetInnerHTML={{ __html: heads.join("\n") }} />
      )}
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
