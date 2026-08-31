import { authenticate, handleError, ok, readJson } from "@/lib/http";
import { tagInputSchema } from "@/lib/validation";
import * as tax from "@/lib/services/taxonomies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await tax.listTags());
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, tagInputSchema);
  if ("res" in body) return body.res;
  try {
    return ok(await tax.createTag(auth.user, body.data), 201);
  } catch (e) {
    return handleError(e);
  }
}
