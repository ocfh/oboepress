import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import type { Media } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { uploadFile, deleteFile } from "@/lib/storage";
import { ForbiddenError, NotFoundError } from "./errors";

export async function listMedia(limit = 50, offset = 0): Promise<{
  items: Media[];
  total: number;
}> {
  const rows = await db
    .select()
    .from(media)
    .orderBy(desc(media.createdAt))
    .limit(Math.min(limit, 100))
    .offset(offset);
  const totalRows = await db.select({ count: media.id }).from(media);
  return { items: rows, total: totalRows.length };
}

export async function getMedia(id: number): Promise<Media> {
  const [row] = await db.select().from(media).where(eq(media.id, id));
  if (!row) throw new NotFoundError("媒体不存在");
  return row;
}

export async function createMediaFromFile(
  user: SessionUser,
  file: File,
  alt = "",
): Promise<Media> {
  if (!can(user.role, "media:upload")) throw new ForbiddenError();
  const result = await uploadFile(file, "media");
  // 落盘名本身是「时间戳-随机」格式（见 storage.ts）；入库的 filename 也存
  // 这座文件名而非原始文件名，保证媒体库展示与实际存储对象一致。
  const storedName = result.url.split("?")[0].split("/").pop() || file.name;
  // 备注（即图片 alt 文本）：用户未填写时默认记录上传时的原始文件名。
  const note = alt.trim() || file.name;
  const [row] = await db
    .insert(media)
    .values({
      filename: storedName,
      url: result.url,
      mimeType: result.contentType,
      size: result.size,
      alt: note,
      uploadedById: user.id,
    })
    .returning();
  return row;
}

export async function deleteMedia(user: SessionUser, id: number): Promise<{ id: number }> {
  const existing = await getMedia(id);
  const isOwner = existing.uploadedById === user.id;
  if (!isOwner && !can(user.role, "content:update:any"))
    throw new ForbiddenError("无权删除该媒体");
  try {
    await deleteFile(existing.url);
  } catch {
    // tolerate storage deletion failure
  }
  await db.delete(media).where(eq(media.id, id));
  return { id };
}

/** Edit metadata (alt text and/or display filename) of an existing media item. */
export async function updateMedia(
  user: SessionUser,
  id: number,
  patch: { filename?: string; alt?: string },
): Promise<Media> {
  const existing = await getMedia(id);
  const isOwner = existing.uploadedById === user.id;
  if (!isOwner && !can(user.role, "content:update:any"))
    throw new ForbiddenError("无权编辑该媒体");
  const [row] = await db
    .update(media)
    .set({
      filename: patch.filename?.trim() || existing.filename,
      alt: patch.alt === undefined ? existing.alt : patch.alt,
    })
    .where(eq(media.id, id))
    .returning();
  return row;
}

/** Bulk delete a set of media ids (skips any the user is not allowed to remove). */
export async function deleteMediaMany(
  user: SessionUser,
  ids: number[],
): Promise<{ deleted: number[]; skipped: number[] }> {
  const deleted: number[] = [];
  const skipped: number[] = [];
  for (const id of ids) {
    try {
      await deleteMedia(user, id);
      deleted.push(id);
    } catch {
      skipped.push(id);
    }
  }
  return { deleted, skipped };
}
