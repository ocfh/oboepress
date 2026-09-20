import fs from "fs";
import path from "path";
import type { ThemeConfig } from "@/db/schema";
import type { AdminMenuItem } from "@/lib/admin-extensions";
import type { SettingField, SettingsSchema } from "@/lib/settings-schema";
import type { NotFoundSettings } from "@/lib/services/not-found-config";

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
  /** 作者网址：后台主题卡片上作者名渲染为指向该地址的超链接。 */
  homepage?: string;
  /** 最后更新时间（作者维护）；缺省回退 manifest.json 文件修改日期。 */
  updatedAt?: string;
  /**
   * 可选的后台一级菜单声明：存在时侧栏出现以主题命名的一级菜单，
   * 二级项（主题设置、说明文档、外链等）完全由主题作者自定义。
   */
  adminMenu?: {
    label?: string;
    icon?: string;
    adminOnly?: boolean;
    superOnly?: boolean;
    items: AdminMenuItem[];
  };
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
  /** 字段出现在哪种内容类型的编辑器；默认仅文章。 */
  target?: "post" | "page" | "both";
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
  SearchPage?: React.ComponentType<{ q: string; page?: number }>;
  /** Optional theme-branded 404 screen; falls back to the shared one. */
  NotFoundPage?: React.ComponentType<{ settings: NotFoundSettings }>;
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
        // 作者未声明更新时间时回退清单文件修改日期，后台始终有时间可展示。
        if (!manifest.updatedAt) {
          try {
            manifest.updatedAt = fs.statSync(manifestPath).mtime.toISOString().slice(0, 10);
          } catch {
            // 读取失败时留空即可
          }
        }
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
 * Tolerates two manifest shapes so an imported theme never crashes the panel:
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
 * 主题代码加载表——构建期自动发现，无需手工登记。
 *
 * require.context 在构建时扫描 themes/ 目录：凡是 `<slug>/index.ts(x)` 的文件夹
 * 都被识别为主题并各自打成独立异步 chunk（第四参 "lazy"），运行时按 slug 取块。
 * 用户/开发者把新主题文件夹放进 themes/ 后重新构建，后台与前台即自动识别，
 * 与插件目录 lib/plugins/loader.ts 的动态 import 机制一致，不再需要改本文件。
 *
 * 不能写成全动态 `import(`@/themes/${slug}/index`)`：那种模板会生成 sync/eager
 * 风格的单一 context 块，把所有主题的客户端代码合进同一个 chunk 白下发（实测
 * 57.6KB）。require.context + "lazy" 让每个目录独立成块，仅当前启用主题被加载；
 * 共用工具仍由 splitChunks 自动提取为小公共块。
 *
 * 生产构建后新增的目录（如后台「新建主题」复制出的源码）既不在 context 内也无
 * 编译产物，需随源码重新构建——这是独立 Next 生产包的固有限制，插件同理。
 */
// require.context 的类型不在常规 @types 内，局部收敛为最小可用签名。
type LazyThemeContext = {
  keys(): string[];
  (id: string): Promise<any>;
};
const themeContext = (
  require as unknown as {
    context: (dir: string, recursive: boolean, regExp: RegExp, mode: "lazy") => LazyThemeContext;
  }
).context("@/themes", true, /^\.\/[^/]+\/index\.tsx?$/, "lazy");

const THEME_LOADERS: Record<string, () => Promise<any>> = {};
for (const key of themeContext.keys()) {
  const slug = key.match(/^\.\/([^/]+)\/index\.tsx?$/)?.[1];
  if (slug) THEME_LOADERS[slug] = () => themeContext(key);
}

/**
 * Dynamically import a theme module by slug.
 * Returns null if the theme doesn't exist or can't be loaded.
 */
export async function loadThemeModule(slug: string): Promise<ThemeModule | null> {
  try {
    // 加载器由 require.context 自动登记；同时要求目录里存在 manifest.json
    // （getThemeManifest 走文件系统扫描），两道识别都通过才认为是合法主题。
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
      NotFoundPage: mod.NotFoundPage,
    };
  } catch {
    return null;
  }
}
