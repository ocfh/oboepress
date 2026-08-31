import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getMenu, updateMenu, deleteMenu } from "@/lib/services/menus";
import { menuInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    return ok(await getMenu(Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = await readJson(req, menuInputSchema);
    if ("res" in body) return body.res;
    return ok(await updateMenu(auth.user, Number(params.id), body.data));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    return ok(await deleteMenu(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}
