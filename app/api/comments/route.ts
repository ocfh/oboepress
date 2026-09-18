import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { listComments, createComment } from "@/lib/services/comments";
import { getPostById } from "@/lib/services/posts";
import { getPageById } from "@/lib/services/pages";
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

    let { items, total } = await listComments({
      postId: post ? Number(post) : undefined,
      postType,
      status: isModerator ? status ?? undefined : status ?? "published",
      parentId: parent ? Number(parent) : undefined,
      limit: 200,
      order: "asc",
    });
    // 后台评论列表需要「查看被评论内容」的真实链接；公开调用不附带，省一次批量解析。
    if (isModerator && items.length) {
      const postIds = [...new Set(items.filter((c) => c.postType !== "page").map((c) => c.postId))];
      const pageIds = [...new Set(items.filter((c) => c.postType === "page").map((c) => c.postId))];
      const [postRows, pageRows] = await Promise.all([
        Promise.all(postIds.map(async (id) => [id, await getPostById(id, true).catch(() => null)] as const)),
        Promise.all(pageIds.map(async (id) => [id, await getPageById(id, true).catch(() => null)] as const)),
      ]);
      const urlById = new Map<number, string>();
      for (const [id, row] of [...postRows, ...pageRows]) if (row) urlById.set(id, row.url);
      items = items.map((c) => ({ ...c, postUrl: urlById.get(c.postId) ?? null }));
    }
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
