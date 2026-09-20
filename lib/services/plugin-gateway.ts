import { HOOKS, applyAsyncFilters } from "@/lib/hooks";
import { ensurePluginsLoaded, listPlugins } from "./plugins";

/** Plugin-authored HTTP response, JSON by default. */
export type PluginApiResponse = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type PluginApiPayload = {
  /** Target plugin slug (URL segment after /api/plugin/). */
  slug: string;
  /** Remaining URL segments, e.g. ["ranking"] for /api/plugin/checkin/ranking. */
  path: string[];
  method: string;
  request: Request;
  response: PluginApiResponse | null;
};

/**
 * Dispatch an /api/plugin/<slug>/... request. Only an installed, enabled plugin
 * may claim its own slug; a missing/disabled plugin or an unclaimed path is 404.
 */
export async function dispatchPluginApi(
  slug: string,
  path: string[],
  request: Request,
): Promise<PluginApiResponse | null> {
  await ensurePluginsLoaded();
  const enabled = (await listPlugins()).some(
    (p) => p.slug === slug && p.enabled && p.installed,
  );
  if (!enabled) return null;

  const out = await applyAsyncFilters<PluginApiPayload>(HOOKS.apiRequest, {
    slug,
    path,
    method: request.method.toUpperCase(),
    request,
    response: null,
  });
  return out.response;
}
