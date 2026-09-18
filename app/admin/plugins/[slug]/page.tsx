import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { getPlugin } from "@/lib/services/plugins";
import { pluginHasAdmin } from "@/lib/plugins/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generic host for plugin-owned admin pages.
 *
 * A plugin opts in purely by convention: ship `plugins/<slug>/admin.tsx`
 * whose default export is a client component. It is mounted here at
 * /admin/plugins/<slug>, reachable from the plugin card or an `admin.menu`
 * entry the plugin registers itself. The host guards existence + activation;
 * the plugin component fetches/mutates its own data through the existing
 * JSON APIs (e.g. /api/plugins/<slug> settings).
 */
export default async function PluginAdminPage({
  params,
}: {
  params: { slug: string };
}) {
  const plugin = await getPlugin(params.slug).catch(() => null);
  if (!plugin || !plugin.enabled || !pluginHasAdmin(params.slug)) notFound();

  let Admin: ComponentType | null = null;
  try {
    const mod = (await import(`@/plugins/${params.slug}/admin`)) as {
      default?: ComponentType;
    };
    Admin = mod.default ?? null;
  } catch {
    notFound();
  }
  if (!Admin) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <h1 className="text-2xl font-bold">{plugin.name}</h1>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          plugins/{params.slug}
        </span>
      </div>
      <Admin />
    </div>
  );
}
