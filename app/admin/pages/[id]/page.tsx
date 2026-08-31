import { notFound } from "next/navigation";
import { getPageById } from "@/lib/services/pages";
import ContentEditor from "@/components/ContentEditor";

export const dynamic = "force-dynamic";

export default async function EditPage({
  params,
}: {
  params: { id: string };
}) {
  let page;
  try {
    page = await getPageById(Number(params.id), true);
  } catch {
    notFound();
  }

  return (
    <ContentEditor
      kind="page"
      initial={{
        id: page.id,
        title: page.title,
        slug: page.slug,
        excerpt: page.excerpt,
        content: page.content,
        status: page.status,
        featuredImage: page.featuredImage,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        commentStatus: page.commentStatus,
        parentId: page.parentId,
        metas: Object.entries(page.metas ?? {}).map(([key, value]) => ({ key, value })),
      }}
      categories={[]}
      tags={[]}
    />
  );
}
