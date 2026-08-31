import { authenticate, authorize, handleError, ok } from "@/lib/http";
import * as pluginService from "@/lib/services/plugins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { slug: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    return ok(await pluginService.getPlugin(params.slug));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Toggle activation and/or persist settings.
 * Body: { enabled?: boolean, settings?: Record<string, unknown> }
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      enabled?: boolean;
      settings?: Record<string, unknown>;
    };
    if (body.settings && typeof body.settings === "object") {
      await pluginService.updatePluginSettings(params.slug, body.settings);
    }
    if (typeof body.enabled === "boolean") {
      await pluginService.setPluginEnabled(params.slug, body.enabled);
    }
    return ok(await pluginService.getPlugin(params.slug));
  } catch (e) {
    return handleError(e);
  }
}
