import { removeAllByOwner, withOwner } from "@/lib/hooks";
import { createContext, type PluginDefinition } from "@/lib/plugins/api";
import { pluginHasEntry } from "@/lib/plugins/registry";

/**
 * Plugin loader.
 *
 * Read the list of enabled plugins, then
 * dynamically `import()` each entry file and run its `setup()`. Registrations
 * happen inside `withOwner()` so disabling a plugin can surgically remove them.
 *
 * The loaded set is cached on `globalThis` so the (potentially many) route
 * modules of one Node process share a single initialisation, and Next's dev
 * hot-reload does not stack duplicate registrations.
 */

type LoadedState = {
  /** slug -> definition, for teardown */
  loaded: Map<string, PluginDefinition<any>>;
  /** in-flight init so concurrent requests coalesce */
  promise: Promise<void> | null;
  /** signature of the last enabled-set we applied */
  signature: string;
};

const g = globalThis as unknown as { __oboePlugins?: LoadedState };

function state(): LoadedState {
  if (!g.__oboePlugins) {
    g.__oboePlugins = { loaded: new Map(), promise: null, signature: "" };
  }
  return g.__oboePlugins;
}

export type EnabledPlugin = { slug: string; settings: Record<string, unknown> };

/**
 * Load (or reload) the given set of enabled plugins. Idempotent: calling it
 * with the same set twice is a no-op; calling it with a different set unloads
 * what disappeared and loads what appeared.
 */
export async function loadPlugins(enabled: EnabledPlugin[]): Promise<void> {
  const s = state();
  const signature = enabled
    .map((p) => `${p.slug}:${JSON.stringify(p.settings)}`)
    .sort()
    .join("|");
  if (s.signature === signature && !s.promise) return;
  if (s.promise) return s.promise;

  s.promise = (async () => {
    const wanted = new Set(enabled.map((p) => p.slug));

    // Unload plugins that are no longer enabled (or whose settings changed).
    for (const [slug, def] of s.loaded) {
      const stillWanted = wanted.has(slug);
      if (stillWanted && s.signature === signature) continue;
      if (!stillWanted || s.signature !== signature) {
        try {
          await def.teardown?.(createContext(slug, {}));
        } catch (err) {
          console.error(`[plugins] teardown of "${slug}" failed:`, err);
        }
        removeAllByOwner(slug);
        s.loaded.delete(slug);
      }
    }

    for (const { slug, settings } of enabled) {
      if (!pluginHasEntry(slug)) {
        console.warn(`[plugins] "${slug}" is enabled but has no entry file — skipped.`);
        continue;
      }
      try {
        const mod = await import(`@/plugins/${slug}/index`);
        const def: PluginDefinition<any> | undefined = mod.default ?? mod.plugin;
        if (def?.setup) {
          const ctx = createContext(slug, settings);
          await withOwner(slug, () => def.setup(ctx));
          s.loaded.set(slug, def);
        } else {
          // Top-level side-effect style.
          s.loaded.set(slug, { setup: () => {} });
        }
      } catch (err) {
        console.error(`[plugins] failed to load "${slug}":`, err);
      }
    }

    s.signature = signature;
  })().finally(() => {
    s.promise = null;
  });

  return s.promise;
}

/** Slugs currently loaded in this process. */
export function loadedPluginSlugs(): string[] {
  return [...state().loaded.keys()];
}

/** Force the next `loadPlugins()` call to re-run (used after toggling in admin). */
export function invalidatePluginCache(): void {
  state().signature = "";
}
