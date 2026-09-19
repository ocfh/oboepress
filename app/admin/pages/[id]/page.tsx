import { notFound } from "next/navigation";
import { getPageById } from "@/lib/services/pages";
import { getActiveTheme } from "@/lib/services/themes";
import { collectEditorFields } from "@/lib/editor-fields";
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

  const activeTheme = await getActiveTheme();
  const editorFields = await collectEditorFields(activeTheme.slug);

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
        publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
        featuredImage: page.featuredImage,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        seoKeywords: page.seoKeywords,
        commentStatus: page.commentStatus,
        parentId: page.parentId,
        metas: Object.entries(page.metas ?? {}).map(([key, value]) => ({ key, value })),
      }}
      categories={[]}
      tags={[]}
      editorFields={editorFields}
    />
  );
}
