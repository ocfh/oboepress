import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plugins, type Plugin } from "@/db/schema";
import {
  discoverPlugins,
  getPluginManifest,
  pluginHasEntry,
  type PluginManifest,
} from "@/lib/plugins/registry";
import { invalidatePluginCache, loadPlugins } from "@/lib/plugins/loader";
import { coerceSettings, resolveSettings } from "@/lib/settings-schema";
import { ensureBootstrap } from "./bootstrap";
import { NotFoundError } from "./errors";

export type PluginView = Plugin & {
  manifest: PluginManifest | null;
  /** Present on disk? A row can outlive a deleted folder. */
  installed: boolean;
  hasEntry: boolean;
  /** defaults merged with stored values */
  resolvedSettings: Record<string, unknown>;
};

/**
 * Sync plugins/ on disk into the `plugins` table.
 * New folders are inserted (disabled by default — never auto-activate code),
 * metadata is refreshed, and rows whose folder disappeared are marked
 * uninstalled by simply not matching a manifest (kept so settings survive a
 * temporary move).
 */
export async function syncPlugins(): Promise<void> {
  const manifests = discoverPlugins();
  for (const m of manifests) {
    await db
      .insert(plugins)
      .values({
        slug: m.slug,
        name: m.name,
        description: m.description ?? "",
        version: m.version ?? "1.0.0",
        author: m.author ?? "",
        enabled: false,
        settings: {},
      })
      .onConflictDoUpdate({
        target: plugins.slug,
        set: {
          name: m.name,
          description: m.description ?? "",
          version: m.version ?? "1.0.0",
          author: m.author ?? "",
        },
      });
  }
}

export async function listPlugins(): Promise<PluginView[]> {
  await ensureBootstrap();
  const rows = await db.select().from(plugins).orderBy(asc(plugins.slug));
  return rows.map((row) => {
    const manifest = getPluginManifest(row.slug);
    return {
      ...row,
      manifest,
      installed: !!manifest,
      hasEntry: !!manifest && pluginHasEntry(row.slug),
      resolvedSettings: resolveSettings(manifest?.settings ?? [], row.settings),
    };
  });
}

export async function getPlugin(slug: string): Promise<PluginView> {
  const all = await listPlugins();
  const found = all.find((p) => p.slug === slug);
  if (!found) throw new NotFoundError("插件不存在");
  return found;
}

export async function setPluginEnabled(
  slug: string,
  enabled: boolean,
): Promise<PluginView> {
  await ensureBootstrap();
  const [row] = await db
    .update(plugins)
    .set({ enabled })
    .where(eq(plugins.slug, slug))
    .returning();
  if (!row) throw new NotFoundError("插件不存在");
  invalidatePluginCache();
  await ensurePluginsLoaded();
  return getPlugin(slug);
}

export async function updatePluginSettings(
  slug: string,
  payload: Record<string, unknown>,
): Promise<PluginView> {
  await ensureBootstrap();
  const manifest = getPluginManifest(slug);
  const clean = coerceSettings(manifest?.settings ?? [], payload);
  const [existing] = await db.select().from(plugins).where(eq(plugins.slug, slug));
  if (!existing) throw new NotFoundError("插件不存在");
  await db
    .update(plugins)
    .set({ settings: { ...existing.settings, ...clean } })
    .where(eq(plugins.slug, slug));
  invalidatePluginCache();
  await ensurePluginsLoaded();
  return getPlugin(slug);
}

/**
 * Ensure every enabled plugin has been imported and had its hooks registered.
 * Call this at the top of any request path that renders content or fires hooks.
 */
export async function ensurePluginsLoaded(): Promise<void> {
  await ensureBootstrap();
  const rows = await db
    .select({ slug: plugins.slug, settings: plugins.settings, enabled: plugins.enabled })
    .from(plugins)
    .where(eq(plugins.enabled, true));
  const manifests = new Map(discoverPlugins().map((m) => [m.slug, m]));
  const enabled = rows
    .filter((r) => manifests.has(r.slug))
    .map((r) => ({
      slug: r.slug,
      settings: resolveSettings(manifests.get(r.slug)?.settings ?? [], r.settings),
    }));
  await loadPlugins(enabled);
}
