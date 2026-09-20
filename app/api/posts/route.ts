import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { postInputSchema } from "@/lib/validation";
import * as posts from "@/lib/services/posts";
import { encodeTextResponse } from "@/lib/http/encode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const opts = {
    status: q.get("status") ?? undefined,
    authorId: q.get("authorId") ? Number(q.get("authorId")) : undefined,
    categoryId: q.get("categoryId") ? Number(q.get("categoryId")) : undefined,
    tagId: q.get("tagId") ? Number(q.get("tagId")) : undefined,
    // 关键词搜索：前台搜索弹窗用它判定「是否唯一命中」，
    // 命中数=1 时直接跳文章、不展示搜索结果页。
    search: q.get("search")?.trim() || undefined,
    limit: q.get("limit") ? Number(q.get("limit")) : 20,
    offset: q.get("offset") ? Number(q.get("offset")) : 0,
  };
  // Unauthenticated callers only ever see published content.
  const session = await getSession();
  if (!session) opts.status = "published";
  try {
    // 列表是前台搜索弹窗的热路径（约 19KB JSON），按 AE 协商压缩至约 4KB
    const data = await posts.listPosts(opts);
    return encodeTextResponse(req, JSON.stringify(data), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "content:create");
  if (denied) return denied;
  const body = await readJson(req, postInputSchema);
  if ("res" in body) return body.res;
  try {
    return ok(await posts.createPost(auth.user, body.data), 201);
  } catch (e) {
    return handleError(e);
  }
}
