import { z } from "zod";
import { ok, handleError, readJson, authenticate, authorize } from "@/lib/http";
import { listMenus, createMenu } from "@/lib/services/menus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listMenus());
  } catch (e) {
    return handleError(e);
  }
}

const createSchema = z.object({
  location: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = await readJson(req, createSchema);
    if ("res" in body) return body.res;
    return ok(await createMenu(body.data.location, body.data.name));
  } catch (e) {
    return handleError(e);
  }
}
