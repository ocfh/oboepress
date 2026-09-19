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
 *
 * 主题文件夹只在进程启动（bootstrap 同步）与后台新建/删除主题时变化，
 * 故扫描结果做进程级缓存；每次公开请求都 readdir+readFile 6 个清单是
 * 纯粹的热路径浪费。写路径（createTheme/deleteTheme）负责调
 * invalidateThemeDiscovery() 让缓存失效。
 */
let discoveryCache: ThemeManifest[] | null = null;

export function discoverThemes(): ThemeManifest[] {
  if (discoveryCache) return discoveryCache;

  const themes: ThemeManifest[] = [];

  if (fs.existsSync(THEMES_DIR)) {
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
  }

  discoveryCache = themes;
  return themes;
}

/** Drop the memoized manifest scan (after admin-side folder changes). */
export function invalidateThemeDiscovery(): void {
  discoveryCache = null;
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
 * 内置主题的显式加载表。
 *
 * 不能图省事写成 `import(`@/themes/${slug}/index`)`：全动态模板会让 webpack
 * 生成一个囊括所有主题目录的 context 单块，把六个主题的导航/轮播/分享等客户端
 * 代码合并进同一个 chunk。前台 SSR 只要渲染任意一个主题（bluemix），访客就会
 * 把 skyscraper/codeman 等其余主题的代码一并下载（实测 57.6KB 的主题块里约
 * 一半是别主题的白下发）。显式映射让每个主题各自成块，仅当前启用主题会被
 * 加载；真正共用的工具仍由 splitChunks 自动提取为小公共块。
 *
 * 键用 manifest.slug（运行时实际传入值）。scottstudio-thyuu（历史目录名
 * oboepress-2032）已随主题瘦身移除，不再保留映射。
 */
// 模块值保持 any：与原全动态 import 的推导结果一致，各主题 index 还允许导出
// manifest.settingsSchema 的兼容形态（{ sections: [...] }），不在这里做严格收窄。
const THEME_LOADERS: Record<string, () => Promise<any>> = {
  bluemix: () => import("@/themes/bluemix"),
  codeman: () => import("@/themes/codeman"),
  default: () => import("@/themes/default"),
  pseudolinear: () => import("@/themes/pseudolinear"),
  skyscraper: () => import("@/themes/skyscraper"),
};

/**
 * Dynamically import a theme module by slug.
 * Returns null if the theme doesn't exist or can't be loaded.
 */
export async function loadThemeModule(slug: string): Promise<ThemeModule | null> {
  try {
    // 只允许显式映射表内的主题。这里绝不能再留 `import(`@/themes/${slug}/index`)`
    // 形式的兜底：只要同文件存在全动态模板，webpack 就会生成覆盖整个 themes/
    // 目录的 context 模块，六个主题的客户端代码被合进同一个 chunk，上面的显式
    // 映射会被完全抵消（实测 chunk 哈希一字节不变）。
    // 后台「新建主题」只是把内置模板复制成 .tsx 源文件；生产构建后新目录既不在
    // webpack context 内也没有编译产物，即便保留动态 import 在生产环境同样加载
    // 失败。自定义主题需要随源码一起构建，届时在此表补一行即可。
    const loader = THEME_LOADERS[slug];
    if (!loader) return null;
    const mod = await loader();
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
