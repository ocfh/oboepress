import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { listCategories, listTags } from "@/lib/services/taxonomies";
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
  return (
    <ContentEditor kind="post" categories={cats} tags={tgs} authors={authors} />
  );
}
