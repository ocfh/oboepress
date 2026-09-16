import fs from "fs";
import path from "path";
import type { ThemeConfig } from "@/db/schema";
import type { SettingField, SettingsSchema } from "@/lib/settings-schema";

/**
 * A theme is a self-contained folder under `themes/<slug>/`:
 *
 *   manifest.json   metadata + design tokens + its OWN settings schema
 *   index.ts        re-exports the four required components
 *   Layout.tsx      PublicLayout
 *   HomePage.tsx    HomePage
 *   PostPage.tsx    PostPage
 *   PageBySlug.tsx  PageBySlug
 *
 * The manifest is plain JSON on purpose: a theme can expose dozens of options
 * (hero copy, sidebar behaviour, licence blocks, …) without shipping a single
 * line of admin React — the generic `SettingsFields` renderer handles it.
 */

/** A named slot a theme exposes for widgets ("主题模块"). */
export interface ThemeWidgetArea {
  key: string;
  label: string;
  description?: string;
}

/** An alternative page/post template the author can pick in the editor. */
export interface ThemeTemplate {
  key: string;
  label: string;
  /** Which content type may use it. Defaults to "both". */
  target?: "post" | "page" | "both";
  description?: string;
}

export interface ThemeManifest {
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  isDefault: boolean;
  /** Design tokens — merged over DEFAULT_THEME_CONFIG. */
  config: ThemeConfig;
  /** Optional preview image, relative to /uploads or an absolute URL. */
  screenshot?: string;
  tags?: string[];
  /** Theme-specific options, rendered after the built-in appearance sections. */
  settingsSchema?: SettingsSchema;
  /** Widget slots this theme renders. */
  widgetAreas?: ThemeWidgetArea[];
  /** Extra templates selectable per post/page. */
  templates?: ThemeTemplate[];
  /** Feature flags, e.g. ["sidebar","toc","comments","dark-toggle"]. */
  supports?: string[];
}

/**
 * A field a theme can inject into the post editor. Each field owns its own
 * postMeta key (exported as `editorMetaKey`) so the shared editors never need
 * to know a theme's internals.
 */
export interface ThemeEditorField {
  metaKey: string;
  Component: React.ComponentType<{
    value: string | null;
    onChange: (hex: string | null) => void;
    featuredImage?: string | null;
  }>;
}

export interface ThemeModule {
  manifest: ThemeManifest;
  PublicLayout: React.ComponentType<{
    children: React.ReactNode;
    siteTitle: string;
    currentSlug?: string;
  }>;
  /** Editor extension fields the theme injects (keyed by a theme-local id). */
  editorFields?: Record<string, ThemeEditorField>;
  /** Optional extra panel rendered on the theme's own settings page. */
  settingsPanel?: React.ComponentType;
  HomePage: React.ComponentType;
  PostPage: React.ComponentType<{ params: { slug: string } }>;
  PageBySlug: React.ComponentType<{ params: { slug: string } }>;
  /** Optional list views a theme may supply. When a theme exports them, the
   *  blog/category/search route pages render with the theme instead of the
   *  default OboePress markup. */
  BlogListPage?: React.ComponentType<{ page: number }>;
  CategoryPage?: React.ComponentType<{ slug: string }>;
  SearchPage?: React.ComponentType<{ q: string }>;
}

const THEMES_DIR = path.join(process.cwd(), "themes");

/** Areas every theme gets for free, so widgets work even in minimal themes. */
export const BASE_WIDGET_AREAS: ThemeWidgetArea[] = [
  { key: "sidebar", label: "侧边栏", description: "文章与列表页的侧栏，需在「布局」中开启侧边栏" },
  { key: "footer", label: "页脚", description: "页面底部的多栏区域" },
];

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
      // Trust the folder name over a mistyped slug so routing never breaks.
      manifest.slug = manifest.slug || entry.name;
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
 * A theme's own settings schema (empty array when it declares none).
 *
 * Tolerates two manifest shapes so a ported theme never crashes the panel:
 *   1. a flat array of sections — the canonical `SettingsSchema` contract;
 *   2. `{ sections: [...] }` where each inner section may use `title` instead
 *      of `label` and omit `key` (a common copy-paste from other CMS themes).
 * Either way we always return a valid `SettingSection[]` with `key` + `label`.
 */
export function getThemeSettingsSchema(slug: string): SettingsSchema {
  const raw = getThemeManifest(slug)?.settingsSchema as unknown;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as SettingsSchema;

  const obj = raw as { sections?: unknown };
  if (Array.isArray(obj.sections)) {
    return (obj.sections as Array<Record<string, unknown>>).map((s, i) => ({
      key: typeof s.key === "string" && s.key ? s.key : `sec-${i}`,
      label: (typeof s.label === "string" && s.label) ||
        (typeof s.title === "string" && s.title) ||
        `Section ${i + 1}`,
      ...(typeof s.description === "string" ? { description: s.description } : {}),
      ...(typeof s.icon === "string" ? { icon: s.icon } : {}),
      fields: Array.isArray(s.fields) ? (s.fields as SettingField[]) : [],
    }));
  }
  return [];
}

/**
 * Widget areas for a theme: its declared areas, plus the base areas that are
 * not already declared (so `sidebar`/`footer` always exist).
 */
export function getThemeWidgetAreas(slug: string): ThemeWidgetArea[] {
  const declared = getThemeManifest(slug)?.widgetAreas ?? [];
  const keys = new Set(declared.map((a) => a.key));
  return [...declared, ...BASE_WIDGET_AREAS.filter((a) => !keys.has(a.key))];
}

/** Templates a theme offers for a given content type. */
export function getThemeTemplates(
  slug: string,
  target: "post" | "page" = "post",
): ThemeTemplate[] {
  const list = getThemeManifest(slug)?.templates ?? [];
  return list.filter((t) => !t.target || t.target === "both" || t.target === target);
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
      editorFields: mod.editorFields,
      settingsPanel: mod.settingsPanel,
      PublicLayout: mod.PublicLayout,
      HomePage: mod.HomePage,
      PostPage: mod.PostPage,
      PageBySlug: mod.PageBySlug,
      BlogListPage: mod.BlogListPage,
      CategoryPage: mod.CategoryPage,
      SearchPage: mod.SearchPage,
    };
  } catch {
    return null;
  }
}
