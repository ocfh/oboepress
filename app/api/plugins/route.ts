import { authenticate, authorize, handleError, ok } from "@/lib/http";
import * as pluginService from "@/lib/services/plugins";
import { listHooks } from "@/lib/hooks";
import { loadedPluginSlugs } from "@/lib/plugins/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List installed plugins (+ live hook registry for the debug panel). */
export async function GET(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    await pluginService.syncPlugins();
    await pluginService.ensurePluginsLoaded();
    const items = await pluginService.listPlugins();
    const url = new URL(req.url);
    if (url.searchParams.get("hooks") === "1") {
      return ok({ data: items, hooks: listHooks(), loaded: loadedPluginSlugs() });
    }
    return ok({ data: items });
  } catch (e) {
    return handleError(e);
  }
}

/** Rescan the plugins/ directory. */
export async function POST() {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    await pluginService.syncPlugins();
    return ok({ data: await pluginService.listPlugins() });
  } catch (e) {
    return handleError(e);
  }
}
