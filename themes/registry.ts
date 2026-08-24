import fs from "fs";
import path from "path";
import type { ThemeConfig } from "@/db/schema";

export interface ThemeManifest {
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  isDefault: boolean;
  config: ThemeConfig;
}

export interface ThemeModule {
  manifest: ThemeManifest;
  PublicLayout: React.ComponentType<{ children: React.ReactNode; siteTitle: string; currentSlug?: string }>;
  HomePage: React.ComponentType;
  PostPage: React.ComponentType<{ params: { slug: string } }>;
  PageBySlug: React.ComponentType<{ params: { slug: string } }>;
}

const THEMES_DIR = path.join(process.cwd(), "themes");

/**
 * Scan the themes/ directory and return all discovered theme manifests.
 * Each subdirectory with a manifest.json is treated as a theme.
 */
export function discoverThemes(): ThemeManifest[] {
  const themes: ThemeManifest[] = [];

  if (!fs.existsSync(THEMES_DIR)) return themes;

  const entries = fs.readdirSync(THEMES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(THEMES_DIR, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw) as ThemeManifest;
      themes.push(manifest);
    } catch {
      // Skip invalid manifests
    }
  }

  return themes;
}

/**
 * Get a single theme manifest by slug.
 */
export function getThemeManifest(slug: string): ThemeManifest | null {
  const themes = discoverThemes();
  return themes.find((t) => t.slug === slug) ?? null;
}

/**
 * Dynamically import a theme module by slug.
 * Returns null if the theme doesn't exist or can't be loaded.
 */
export async function loadThemeModule(slug: string): Promise<ThemeModule | null> {
  try {
    const mod = await import(`@/themes/${slug}/index`);
    const manifest = getThemeManifest(slug);
    if (!manifest) return null;

    return {
      manifest,
      PublicLayout: mod.PublicLayout,
      HomePage: mod.HomePage,
      PostPage: mod.PostPage,
      PageBySlug: mod.PageBySlug,
    };
  } catch {
    return null;
  }
}
