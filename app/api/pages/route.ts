import { authenticate, handleError, ok, readJson } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { pageInputSchema } from "@/lib/validation";
import * as pages from "@/lib/services/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const opts = {
    status: q.get("status") ?? undefined,
    limit: q.get("limit") ? Number(q.get("limit")) : 20,
    offset: q.get("offset") ? Number(q.get("offset")) : 0,
  };
  const session = await getSession();
  if (!session) opts.status = "published";
  try {
    return ok(await pages.listPages(opts));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, pageInputSchema);
  if ("res" in body) return body.res;
  try {
    return ok(await pages.createPage(auth.user, body.data), 201);
  } catch (e) {
    return handleError(e);
  }
}
