import { eq } from "drizzle-orm";
import { db } from "@/db";
import { postMetas, pageMetas } from "@/db/schema";

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

/** 独立页面的自定义字段读取（页面在 pages 表，不能复用 post_metas 的外键）。 */
export async function getPageMetas(pageId: number): Promise<Record<string, string>> {
  const rows = await db.select().from(pageMetas).where(eq(pageMetas.pageId, pageId));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value ?? "";
  return out;
}

/** 整表替换独立页面的自定义字段集。 */
export async function setPageMetas(pageId: number, metas: MetaInput[]): Promise<void> {
  await db.delete(pageMetas).where(eq(pageMetas.pageId, pageId));
  const clean = metas
    .map((m) => ({ key: m.key.trim(), value: m.value }))
    .filter((m) => m.key.length > 0);
  if (clean.length) {
    await db.insert(pageMetas).values(clean.map((m) => ({ pageId, key: m.key, value: m.value })));
  }
}
