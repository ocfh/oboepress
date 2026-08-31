import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { setCommentsStatus, deleteComments } from "@/lib/services/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bulkSchema = z.object({
  action: z.enum(["status", "delete"]),
  ids: z.array(z.number().int().positive()),
  status: z.enum(["published", "pending", "spam"]).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "content:update:any");
  if (denied) return denied;
  try {
    const body = await readJson(req, bulkSchema);
    if ("res" in body) return body.res;
    const { action, ids, status } = body.data;
    if (action === "delete") return ok({ ids: await deleteComments(auth.user, ids) });
    if (!status) return ok({ ids: [] });
    return ok({ ids: await setCommentsStatus(auth.user, ids, status) });
  } catch (e) {
    return handleError(e);
  }
}
