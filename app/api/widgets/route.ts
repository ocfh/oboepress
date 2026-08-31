import { authenticate, authorize, handleError, ok, fail } from "@/lib/http";
import * as widgetService from "@/lib/services/widgets";
import { getActiveTheme } from "@/lib/services/themes";
import { getThemeWidgetAreas } from "@/themes/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/widgets?theme=<slug>
 *
 * Returns everything the widget manager needs in one round trip: the theme's
 * declared areas, the registered types (including plugin-provided ones) and the
 * existing instances for that theme.
 */
export async function GET(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("theme") || (await getActiveTheme()).slug;
    return ok({
      theme: slug,
      areas: getThemeWidgetAreas(slug),
      types: await widgetService.listWidgetTypes(),
      widgets: await widgetService.listWidgets(slug),
    });
  } catch (e) {
    return handleError(e);
  }
}

/** Create a widget instance in an area. */
export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const area = String(body.area ?? "").trim();
    const type = String(body.type ?? "").trim();
    if (!area || !type) return fail("缺少 area 或 type", 422);
    const themeSlug = String(body.themeSlug ?? "") || (await getActiveTheme()).slug;
    return ok(
      await widgetService.createWidget({
        area,
        type,
        themeSlug,
        title: typeof body.title === "string" ? body.title : undefined,
        config:
          body.config && typeof body.config === "object"
            ? (body.config as Record<string, unknown>)
            : undefined,
      }),
      201,
    );
  } catch (e) {
    return handleError(e);
  }
}

/** Persist a new order for one area. Body: { ids: number[] } */
export async function PATCH(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    if (!Array.isArray(body.ids)) return fail("ids 必须是数组", 422);
    const ids = body.ids.map(Number).filter((n) => Number.isInteger(n));
    await widgetService.reorderWidgets(ids);
    return ok({ ok: true, count: ids.length });
  } catch (e) {
    return handleError(e);
  }
}
