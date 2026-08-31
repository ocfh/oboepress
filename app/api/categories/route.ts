import { authenticate, handleError, ok, readJson } from "@/lib/http";
import { categoryInputSchema, categoryReorderSchema } from "@/lib/validation";
import * as tax from "@/lib/services/taxonomies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await tax.listCategories());
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, categoryReorderSchema);
  if ("res" in body) return body.res;
  try {
    return ok(await tax.reorderCategories(auth.user, body.data.items));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, categoryInputSchema);
  if ("res" in body) return body.res;
  try {
    return ok(await tax.createCategory(auth.user, body.data), 201);
  } catch (e) {
    return handleError(e);
  }
}
