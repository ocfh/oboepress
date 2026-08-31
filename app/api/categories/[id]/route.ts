import { authenticate, handleError, ok, readJson } from "@/lib/http";
import { categoryInputSchema } from "@/lib/validation";
import * as tax from "@/lib/services/taxonomies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    return ok(await tax.getCategory(Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, categoryInputSchema.partial());
  if ("res" in body) return body.res;
  try {
    return ok(await tax.updateCategory(auth.user, Number(params.id), body.data));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    return ok(await tax.deleteCategory(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}
