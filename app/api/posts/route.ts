import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { postInputSchema } from "@/lib/validation";
import * as posts from "@/lib/services/posts";

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
    limit: q.get("limit") ? Number(q.get("limit")) : 20,
    offset: q.get("offset") ? Number(q.get("offset")) : 0,
  };
  // Unauthenticated callers only ever see published content.
  const session = await getSession();
  if (!session) opts.status = "published";
  try {
    return ok(await posts.listPosts(opts));
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
