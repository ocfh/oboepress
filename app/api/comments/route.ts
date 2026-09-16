import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { listComments, createComment } from "@/lib/services/comments";
import { commentInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const post = url.searchParams.get("post");
    const postType = url.searchParams.get("postType") ?? "post";
    const status = url.searchParams.get("status");
    const parent = url.searchParams.get("parentId");

    const session = await getSession();
    const isModerator = !!session && (session.role === "admin" || session.role === "editor");

    // Non-public listings require editor+ role.
    if (status && status !== "published" && !isModerator) {
      const auth = await authenticate();
      if ("res" in auth) return auth.res;
      const denied = authorize(auth.user, "content:update:any");
      if (denied) return denied;
    }

    const { items, total } = await listComments({
      postId: post ? Number(post) : undefined,
      postType,
      status: isModerator ? status ?? undefined : status ?? "published",
      parentId: parent ? Number(parent) : undefined,
      limit: 200,
      order: "asc",
    });
    return ok({ items, total });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req, commentInputSchema);
    if ("res" in body) return body.res;
    const session = await getSession();
    const ip =
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const siteHost =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      new URL(req.url).host;
    const { comment, isPublic } = await createComment({
      ...body.data,
      userId: session?.id ?? null,
      ip,
      siteHost,
    });
    return ok({ id: comment.id, isPublic, status: comment.status });
  } catch (e) {
    return handleError(e);
  }
}
