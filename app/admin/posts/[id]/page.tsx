import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPostById } from "@/lib/services/posts";
import { listCategories, listTags } from "@/lib/services/taxonomies";
import { getActiveTheme } from "@/lib/services/themes";
import { collectEditorFields } from "@/lib/editor-fields";
import ContentEditor from "@/components/ContentEditor";

export const dynamic = "force-dynamic";

export default async function EditPost({
  params,
}: {
  params: { id: string };
}) {
  let post;
  try {
    post = await getPostById(Number(params.id), true);
  } catch {
    notFound();
  }

  const [cats, tgs] = await Promise.all([listCategories(), listTags()]);
  const session = await getSession();
  let authors: { id: number; name: string }[] = [];
  if (session && (session.role === "admin" || session.role === "editor")) {
    authors = await db.select({ id: users.id, name: users.name }).from(users);
  }
  const activeTheme = await getActiveTheme();
  const editorFields = await collectEditorFields(activeTheme.slug);

  return (
    <ContentEditor
      kind="post"
      initial={{
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        status: post.status,
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        featuredImage: post.featuredImage,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        seoKeywords: post.seoKeywords,
        commentStatus: post.commentStatus,
        authorId: post.author?.id ?? null,
        categoryIds: post.categories.map((c) => c.id),
        tagIds: post.tags.map((t) => t.id),
        metas: Object.entries(post.metas ?? {}).map(([key, value]) => ({ key, value })),
        format: post.format ?? "standard",
        formatMeta: (post.formatMeta as Record<string, string>) ?? {},
        pinned: post.pinned ?? false,
      }}
      categories={cats}
      tags={tgs}
      authors={authors}
      editorFields={editorFields}
    />
  );
}
