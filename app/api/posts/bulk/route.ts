import { z } from "zod";
import { authenticate, handleError, ok, readJson } from "@/lib/http";
import * as posts from "@/lib/services/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 文章列表批量操作：改状态（发布/草稿/归档）或删除。单次最多 100 篇。
const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  action: z.enum(["publish", "draft", "archive", "delete"]),
});

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, bulkSchema);
  if ("res" in body) return body.res;
  try {
    const { ids, action } = body.data;
    if (action === "delete") return ok(await posts.bulkDelete(auth.user, ids));
    const status =
      action === "publish" ? "published" : action === "draft" ? "draft" : "archived";
    return ok(await posts.bulkUpdateStatus(auth.user, ids, status));
  } catch (e) {
    return handleError(e);
  }
}
