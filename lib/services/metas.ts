import { eq } from "drizzle-orm";
import { db } from "@/db";
import { postMetas } from "@/db/schema";

export type MetaInput = { key: string; value: string };

/** Read all custom fields for a post/page as a key→value map. */
export async function getPostMetas(postId: number): Promise<Record<string, string>> {
  const rows = await db.select().from(postMetas).where(eq(postMetas.postId, postId));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value ?? "";
  return out;
}

/** Replace the entire custom-field set for a post/page. */
export async function setPostMetas(postId: number, metas: MetaInput[]): Promise<void> {
  await db.delete(postMetas).where(eq(postMetas.postId, postId));
  const clean = metas
    .map((m) => ({ key: m.key.trim(), value: m.value }))
    .filter((m) => m.key.length > 0);
  if (clean.length) {
    await db.insert(postMetas).values(clean.map((m) => ({ postId, key: m.key, value: m.value })));
  }
}
