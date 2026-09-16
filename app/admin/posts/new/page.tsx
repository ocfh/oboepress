import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { listCategories, listTags } from "@/lib/services/taxonomies";
import { getActiveTheme } from "@/lib/services/themes";
import { collectEditorFields } from "@/lib/editor-fields";
import ContentEditor from "@/components/ContentEditor";

export const dynamic = "force-dynamic";

export default async function NewPost() {
  const [cats, tgs] = await Promise.all([listCategories(), listTags()]);
  const session = await getSession();
  let authors: { id: number; name: string }[] = [];
  if (session && (session.role === "admin" || session.role === "editor")) {
    authors = await db
      .select({ id: users.id, name: users.name })
      .from(users);
  }
  const activeTheme = await getActiveTheme();
  const editorFields = await collectEditorFields(activeTheme.slug);
  return (
    <ContentEditor
      kind="post"
      categories={cats}
      tags={tgs}
      authors={authors}
      editorFields={editorFields}
    />
  );
}
