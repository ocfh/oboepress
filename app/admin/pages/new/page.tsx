import ContentEditor from "@/components/ContentEditor";
import { getActiveTheme } from "@/lib/services/themes";
import { collectEditorFields } from "@/lib/editor-fields";

export const dynamic = "force-dynamic";

export default async function NewPage() {
  const activeTheme = await getActiveTheme();
  const editorFields = await collectEditorFields(activeTheme.slug);
  return <ContentEditor kind="page" categories={[]} tags={[]} editorFields={editorFields} />;
}
