import { put, del } from "@vercel/blob";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

export type UploadResult = {
  url: string;
  size: number;
  contentType: string;
};

/**
 * content/ 为用户内容根目录，遵循「核心/扩展/内容」三分约定，
 * 上传不随构建丢失。
 */
export const CONTENT_DIR = path.join(process.cwd(), "content");
export const UPLOADS_DIR = path.join(CONTENT_DIR, "uploads");

/**
 * Object storage: 生产用 Vercel Blob，自托管写入 content/uploads 并由
 * /uploads/[...path] 路由提供。换 S3/R2 只需替换下方 put 调用。
 */
export async function uploadFile(
  file: File,
  folder = "media",
): Promise<UploadResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name);
  const random = Math.random().toString(36).slice(2, 10);
  const safeName = `${folder}/${Date.now()}-${random}${ext}`;
  const contentType = file.type || "application/octet-stream";

  if (token) {
    const blob = await put(safeName, buffer, {
      access: "public",
      contentType,
      token,
    });
    return { url: blob.url, size: buffer.length, contentType };
  }

  // Self-hosted fallback: content/uploads/<folder>/<name>
  const dir = path.join(UPLOADS_DIR, folder);
  await mkdir(dir, { recursive: true });
  const localName = safeName.split("/").pop()!;
  await writeFile(path.join(dir, localName), buffer);
  return {
    url: `/uploads/${folder}/${localName}`,
    size: buffer.length,
    contentType,
  };
}

export async function deleteFile(url: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const isBlob =
    token && /^https:\/\//.test(url) && url.includes("blob.vercel-storage.com");
  if (isBlob) {
    await del(url, { token });
    return;
  }
  if (url.startsWith("/uploads/")) {
    const rel = url.replace(/^\/uploads\//, "");
    // Never let a crafted URL escape the uploads root.
    const target = path.resolve(UPLOADS_DIR, rel);
    if (!target.startsWith(path.resolve(UPLOADS_DIR))) return;
    await unlink(target).catch(() => {});
    // Legacy location (pre content/ split) — clean it up too.
    await unlink(path.join(process.cwd(), "public", url)).catch(() => {});
  }
}
