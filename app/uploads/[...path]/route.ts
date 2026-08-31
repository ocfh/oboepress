import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { UPLOADS_DIR } from "@/lib/storage";

/**
 * Serve user uploads that live in content/uploads (outside public/).
 *
 * Keeping media in content/ means a redeploy or a core upgrade never wipes
 * user files, while the public URL shape (/uploads/media/xxx.png) is identical
 * to a classic public/ folder — themes and stored media rows need no changes.
 */

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".zip": "application/zip",
};

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } },
) {
  const segments = params.path ?? [];
  if (!segments.length) return new NextResponse("Not found", { status: 404 });

  const root = path.resolve(UPLOADS_DIR);
  const target = path.resolve(root, ...segments);

  // Path traversal guard: the resolved file must stay under the uploads root.
  if (!target.startsWith(root + path.sep) && target !== root) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!existsSync(target)) {
    // Fall back to the legacy public/uploads location for pre-split installs.
    const legacy = path.resolve(process.cwd(), "public", "uploads", ...segments);
    if (!existsSync(legacy)) return new NextResponse("Not found", { status: 404 });
    return stream(legacy);
  }

  const stat = statSync(target);
  if (stat.isDirectory()) return new NextResponse("Not found", { status: 404 });
  return stream(target);
}

function stream(file: string) {
  const stat = statSync(file);
  const ext = path.extname(file).toLowerCase();
  const nodeStream = createReadStream(file);
  return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Last-Modified": stat.mtime.toUTCString(),
    },
  });
}
