import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { updateComment, deleteComment } from "@/lib/services/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  status: z.enum(["published", "pending", "spam"]).optional(),
  content: z.string().max(2000).optional(),
  authorName: z.string().max(60).optional(),
  authorEmail: z.string().email().optional(),
  authorUrl: z.string().max(300).optional(),
});

export async function PUT(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "content:update:any");
  if (denied) return denied;
  try {
    const body = await readJson(req, updateSchema);
    if ("res" in body) return body.res;
    return ok(await updateComment(auth.user, Number(params.id), body.data));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "content:update:any");
  if (denied) return denied;
  try {
    return ok(await deleteComment(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}
