import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Serve theme-bundled static assets (themes/<slug>/assets/**) at
 * /theme-assets/<slug>/... — themes ship their own runtime scripts/fonts
 * instead of polluting public/.
 */

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } },
) {
  const segments = params.path ?? [];
  if (segments.length < 2) return new NextResponse("Not found", { status: 404 });

  const themesRoot = path.resolve(process.cwd(), "themes");
  // /theme-assets/<slug>/<p...> maps to themes/<slug>/assets/<p...> on disk.
  const target = path.resolve(themesRoot, segments[0], "assets", ...segments.slice(1));

  // Path traversal guard + must live under a theme's assets/ directory.
  if (!target.startsWith(themesRoot + path.sep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!existsSync(target) || statSync(target).isDirectory()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stat = statSync(target);
  const nodeStream = createReadStream(target);
  const ext = path.extname(target).toLowerCase();
  return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Last-Modified": stat.mtime.toUTCString(),
    },
  });
}
