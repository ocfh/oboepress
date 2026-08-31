import { authenticate, handleError, ok, readJson } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { postInputSchema } from "@/lib/validation";
import * as posts from "@/lib/services/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const session = await getSession();
  const includeUnpublished = !!session;
  try {
    return ok(await posts.getPostById(id, includeUnpublished));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  // Ownership is enforced inside the service (authors edit own, editors/admins any).
  const body = await readJson(req, postInputSchema.partial());
  if ("res" in body) return body.res;
  try {
    return ok(await posts.updatePost(auth.user, Number(params.id), body.data));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    return ok(await posts.deletePost(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}
