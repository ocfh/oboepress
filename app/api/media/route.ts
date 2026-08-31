import { authenticate, handleError, ok } from "@/lib/http";
import * as media from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Media is visible to any authenticated user with read access.
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit")
    ? Number(url.searchParams.get("limit"))
    : 50;
  try {
    return ok(await media.listMedia(limit));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return ok({ error: "缺少文件" }, 400);
    const alt = (form.get("alt") as string) || "";
    const row = await media.createMediaFromFile(auth.user, file, alt);
    return ok(row, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("ids");
    if (!raw) return ok({ error: "缺少 ids 参数" }, 400);
    const ids = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return ok({ error: "无效 ids" }, 400);
    const result = await media.deleteMediaMany(auth.user, ids);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
