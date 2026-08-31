import { authenticate, authorize, handleError, ok } from "@/lib/http";
import * as widgetService from "@/lib/services/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Update title / area / enabled / config of one instance. */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return ok(
      await widgetService.updateWidget(Number(params.id), {
        area: typeof body.area === "string" ? body.area : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        order: typeof body.order === "number" ? body.order : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        config:
          body.config && typeof body.config === "object"
            ? (body.config as Record<string, unknown>)
            : undefined,
      }),
    );
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
    return ok(await widgetService.deleteWidget(Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}
