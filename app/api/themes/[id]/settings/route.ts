import { authenticate, authorize, handleError, ok } from "@/lib/http";
import * as themes from "@/lib/services/themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `id` accepts a numeric theme id **or** a slug, so the admin can use either. */
type Ctx = { params: { id: string } };

/** Full panel payload: both schemas + resolved values + widget areas. */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    return ok(await themes.getThemePanel(params.id));
  } catch (e) {
    return handleError(e);
  }
}

/** Save a mixed appearance + theme-settings payload. */
export async function PUT(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body || typeof body !== "object") return handleError(new Error("bad body"));
    await themes.updateThemePanel(params.id, body);
    return ok(await themes.getThemePanel(params.id));
  } catch (e) {
    return handleError(e);
  }
}

/** Reset to manifest defaults. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    await themes.resetThemePanel(params.id);
    return ok(await themes.getThemePanel(params.id));
  } catch (e) {
    return handleError(e);
  }
}
