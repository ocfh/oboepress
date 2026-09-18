import fs from "node:fs";
import path from "node:path";
import type { SettingsSchema } from "@/lib/settings-schema";

/**
 * Plugin discovery. A plugin is any `plugins/<slug>/` directory holding a
 * `plugin.json`. Nothing is imported here — discovery must stay cheap and
 * side-effect free so the admin can list disabled plugins too.
 */

export interface PluginManifest {
  slug: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  /** Minimum core version required. */
  requires?: string;
  homepage?: string;
  /** lucide-react icon name shown in the admin list. */
  icon?: string;
  /** Declarative settings form. */
  settings?: SettingsSchema;
  /** Hooks the plugin registers — informational, shown in the admin. */
  hooks?: string[];
}

const PLUGINS_DIR = path.join(process.cwd(), "plugins");

export function discoverPlugins(): PluginManifest[] {
  const found: PluginManifest[] = [];
  if (!fs.existsSync(PLUGINS_DIR)) return found;

  for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(PLUGINS_DIR, entry.name, "plugin.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as PluginManifest;
      // Directory name always wins so a copy/paste manifest cannot shadow another.
      manifest.slug = entry.name;
      if (!manifest.name) manifest.name = entry.name;
      found.push(manifest);
    } catch {
      // Ignore invalid manifests instead of taking the whole admin down.
    }
  }
  return found.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getPluginManifest(slug: string): PluginManifest | null {
  return discoverPlugins().find((p) => p.slug === slug) ?? null;
}

/** Does the plugin ship an entry file we can import? */
export function pluginHasEntry(slug: string): boolean {
  const dir = path.join(PLUGINS_DIR, slug);
  return ["index.ts", "index.tsx", "index.js", "index.mjs"].some((f) =>
    fs.existsSync(path.join(dir, f)),
  );
}

/**
 * Does the plugin ship a custom admin page? Convention: `plugins/<slug>/admin.tsx`
 * (default-exported client component), hosted at /admin/plugins/<slug>.
 */
export function pluginHasAdmin(slug: string): boolean {
  const dir = path.join(PLUGINS_DIR, slug);
  return ["admin.tsx", "admin.jsx", "admin.js"].some((f) =>
    fs.existsSync(path.join(dir, f)),
  );
}
