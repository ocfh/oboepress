import { authenticate, handleError, ok, readJson } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { pageInputSchema } from "@/lib/validation";
import * as pages from "@/lib/services/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  try {
    return ok(await pages.getPageById(Number(params.id), !!session));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, pageInputSchema.partial());
  if ("res" in body) return body.res;
  try {
    return ok(await pages.updatePage(auth.user, Number(params.id), body.data));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    return ok(await pages.deletePage(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}
