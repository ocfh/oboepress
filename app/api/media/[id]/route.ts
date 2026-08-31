import { authenticate, handleError, ok } from "@/lib/http";
import * as media from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    return ok(await media.deleteMedia(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    const body = await req.json().catch(() => ({}));
    const patch: { filename?: string; alt?: string } = {};
    if (typeof body.filename === "string") patch.filename = body.filename;
    if (typeof body.alt === "string") patch.alt = body.alt;
    return ok(await media.updateMedia(auth.user, Number(params.id), patch));
  } catch (e) {
    return handleError(e);
  }
}
