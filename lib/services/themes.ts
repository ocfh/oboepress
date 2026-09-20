import { desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { siteSettings, themes, type Theme, type ThemeConfig } from "@/db/schema";
import { coerceSettings, resolveSettings, type SettingsSchema } from "@/lib/settings-schema";
import { DEFAULT_THEME_CONFIG, resolveThemeConfig } from "@/lib/theme";
import { applyPalette, isPaletteSupplied } from "@/lib/theme-palettes";
import { THEME_CONFIG_KEYS, THEME_CONFIG_SCHEMA } from "@/lib/theme-schema";
import {
  discoverThemes,
  getThemeManifest,
  getThemeSettingsSchema,
  getThemeWidgetAreas,
  invalidateThemeDiscovery,
  type ThemeWidgetArea,
} from "@/themes/registry";
import { rmSyncRetry } from "../fs-utils";
import { ensureBootstrap } from "./bootstrap";
import { NotFoundError, ValidationError } from "./errors";
import { publicCached, cacheKey, bump, bumpAll } from "./public-cache";
import { installPackage } from "./package-install";

export type ThemeInput = {
  name: string;
  slug?: string;
  config?: ThemeConfig;
  settings?: Record<string, unknown>;
};

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `theme-${Date.now()}`;
}

/**
 * Sync the themes/ directory into the `themes` table.
 *
 * Mirrors the plugin flow: every folder that ships a manifest.json is upserted
 * (only its display name is refreshed — never the user's saved `config` /
 * `settings`), and any DB row whose folder has been deleted from disk is pruned.
 * That is exactly why deleting a theme folder now removes it from the admin
 * immediately, instead of lingering as a "hard-coded" entry.
 */
export async function syncThemes(): Promise<void> {
  const manifests = discoverThemes();
  const discovered = new Set(manifests.map((m) => m.slug));
  for (const m of manifests) {
    await db
      .insert(themes)
      .values({ name: m.name, slug: m.slug, isDefault: m.isDefault, config: m.config })
      .onConflictDoUpdate({
        target: themes.slug,
        // Preserve the user's colour/option tweaks — only refresh the name and
        // the default flag (which the manifest owns, not the user).
        set: { name: m.name, isDefault: m.isDefault },
      });
  }
  const rows = await db.select({ slug: themes.slug }).from(themes);
  for (const r of rows) {
    if (!discovered.has(r.slug)) {
      await db.delete(themes).where(eq(themes.slug, r.slug));
    }
  }
}

export async function listThemes(): Promise<Theme[]> {
  await ensureBootstrap();
  // 后台列表是低频路径：重新扫盘以保留「手动删文件夹即时消失」的语义。
  invalidateThemeDiscovery();
  await syncThemes();
  return db.select().from(themes).orderBy(desc(themes.isDefault), desc(themes.createdAt));
}

export async function getThemeBySlug(slug: string): Promise<Theme | null> {
  await ensureBootstrap();
  const [row] = await db.select().from(themes).where(eq(themes.slug, slug));
  return row ?? null;
}

/**
 * 公开渲染热路径上被调用最频繁的读取（root layout、catch-all、各主题
 * Layout/HomePage/Sidebar 每请求 3~6 次）。React cache 让同一次请求内的
 * 重复调用复用同一个 Promise；syncThemes 只在进程 bootstrap 与后台主题
 * 管理动作（list/create/delete）时跑，绝不在每个公开请求里对每个主题
 * 执行 upsert——那曾是单次首页渲染几十条无谓 SQL 的主要来源。
 */
export function getActiveTheme(): Promise<Theme> {
  return publicCached(cacheKey("theme", "active"), getActiveThemeUncached);
}

async function getActiveThemeUncached(): Promise<Theme> {
  await ensureBootstrap();
  const [settings] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, 1));
  let slug = settings?.activeThemeSlug || "default";
  // If the configured active theme's folder is gone, fall back to a discovered one.
  if (!getThemeManifest(slug)) {
    const discovered = discoverThemes();
    const fallback = discovered.find((t) => t.isDefault) ?? discovered[0] ?? null;
    if (fallback) {
      slug = fallback.slug;
      await db
        .update(siteSettings)
        .set({ activeThemeSlug: slug })
        .where(eq(siteSettings.id, 1));
    }
  }
  const [theme] = await db.select().from(themes).where(eq(themes.slug, slug));
  if (theme) return theme;
  const [def] = await db.select().from(themes).where(eq(themes.isDefault, true));
  if (def) return def;
  const [anyTheme] = await db.select().from(themes).limit(1);
  if (anyTheme) return anyTheme;
  throw new NotFoundError("没有可用主题");
}

export async function getThemeById(id: number): Promise<Theme> {
  const [row] = await db.select().from(themes).where(eq(themes.id, id));
  if (!row) throw new NotFoundError("主题不存在");
  return row;
}

export async function createTheme(input: ThemeInput): Promise<Theme> {
  await ensureBootstrap();
  const slug = input.slug?.trim() || slugifyName(input.name);

  // A theme is a real folder under themes/<slug>/ — refuse if it already exists
  // on disk, and never create a phantom DB-only row (that used to be the reason
  // a "theme" lingered after its folder was deleted).
  const dir = path.join(process.cwd(), "themes", slug);
  if (fs.existsSync(dir)) throw new ValidationError("主题文件夹已存在");
  const [exists] = await db.select({ id: themes.id }).from(themes).where(eq(themes.slug, slug));
  if (exists) throw new ValidationError("主题标识已存在");

  // Scaffold a real, auto-discoverable theme folder from the default template.
  const tpl = path.join(process.cwd(), "themes", "default");
  copyThemeTemplate(tpl, dir, slug, input.name, input.config);

  // 新文件夹落盘后先让清单缓存失效，再同步入库。
  invalidateThemeDiscovery();
  await syncThemes();
  const [row] = await db.select().from(themes).where(eq(themes.slug, slug));
  bump("theme");
  return row!;
}

/**
 * 从上传的 zip 安装主题：校验 manifest.json + 入口、落盘 themes/<slug>、
 * 同步入库。不合规抛 ValidationError，安装器已保证临时文件与半成品目录被清理。
 */
export async function installThemeZip(buf: Buffer): Promise<Theme> {
  await ensureBootstrap();
  const info = installPackage("theme", buf);
  invalidateThemeDiscovery();
  await syncThemes();
  const [row] = await db.select().from(themes).where(eq(themes.slug, info.slug));
  if (!row) throw new ValidationError("主题已落盘但同步失败，请检查 manifest.json");
  bump("theme");
  return row;
}

/** Recursively copy a directory. */
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Copy the default theme as a new, auto-discoverable theme folder.
 * `manifest.json` is rewritten (name / slug / isDefault=false, optional config
 * override); `index.ts`'s THEME_SLUG constant is also updated so it's not lying.
 */
function copyThemeTemplate(
  tpl: string,
  dest: string,
  slug: string,
  name: string,
  config?: ThemeConfig,
): void {
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(tpl)) {
    // Last-resort: a bare manifest so the folder is still discovered.
    fs.writeFileSync(
      path.join(dest, "manifest.json"),
      JSON.stringify(
        { name, slug, description: "", version: "1.0.0", author: "", isDefault: false, config: config ?? {} },
        null,
        2,
      ),
    );
    return;
  }
  for (const entry of fs.readdirSync(tpl, { withFileTypes: true })) {
    const s = path.join(tpl, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.name === "manifest.json") {
      const manifest = JSON.parse(fs.readFileSync(s, "utf-8"));
      manifest.name = name;
      manifest.slug = slug;
      manifest.isDefault = false;
      if (config && Object.keys(config).length) manifest.config = config;
      fs.writeFileSync(d, JSON.stringify(manifest, null, 2));
    } else if (entry.name === "index.ts") {
      const code = fs.readFileSync(s, "utf-8").replace(/oboepress-2026|themes\/default/g, slug);
      fs.writeFileSync(d, code);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

export async function updateTheme(
  id: number,
  input: Partial<ThemeInput>,
): Promise<Theme> {
  const existing = await getThemeById(id);
  const slug = input.slug?.trim() || existing.slug;
  if (slug !== existing.slug) {
    const [exists] = await db.select({ id: themes.id }).from(themes).where(eq(themes.slug, slug));
    if (exists) throw new ValidationError("主题标识已存在");
  }
  const [row] = await db
    .update(themes)
    .set({
      name: input.name ?? existing.name,
      slug,
      // Merge partial config updates so editing one detail preserves the rest.
      config: { ...existing.config, ...(input.config ?? {}) },
      settings: input.settings
        ? { ...existing.settings, ...input.settings }
        : existing.settings,
    })
    .where(eq(themes.id, id))
    .returning();
  bump("theme");
  return row;
}

export async function deleteTheme(id: number): Promise<{ id: number }> {
  const existing = await getThemeById(id);

  // Never leave the site without an active theme: if this one is active, point
  // the setting at another discovered theme first.
  const [settings] = await db
    .select({ activeThemeSlug: siteSettings.activeThemeSlug })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1));
  if (settings?.activeThemeSlug === existing.slug) {
    const discovered = discoverThemes().filter((t) => t.slug !== existing.slug);
    const fallback = discovered.find((t) => t.isDefault) ?? discovered[0] ?? null;
    if (fallback) {
      await db
        .update(siteSettings)
        .set({ activeThemeSlug: fallback.slug })
        .where(eq(siteSettings.id, 1));
    }
  }

  // Remove the theme folder too, so auto-discovery stops re-registering it.
  const dir = path.join(process.cwd(), "themes", existing.slug);
  if (fs.existsSync(dir)) {
    // 刚落盘的文件可能被杀软短暂占用，退避重试避免 EBUSY 导致删除 500。
    rmSyncRetry(dir);
  }
  // 文件夹已删：丢弃清单缓存，后续扫描不再找回该主题。
  invalidateThemeDiscovery();
  await db.delete(themes).where(eq(themes.id, id));
  // 可能连带改了 siteSettings 的 activeThemeSlug，整站缓存清空最稳妥。
  bumpAll();
  return { id };
}

/** Mark a theme as the public-site active theme. */
export async function setActiveTheme(id: number): Promise<Theme> {
  const theme = await getThemeById(id);
  await db
    .update(siteSettings)
    .set({ activeThemeSlug: theme.slug, updatedAt: new Date() })
    .where(eq(siteSettings.id, 1));
  // 直接写了 siteSettings 行，getSettings 与全部主题渲染缓存都需失效。
  bumpAll();
  return theme;
}

/* -------------------------------------------------------------------------- */
/* Manifest-driven settings panel                                             */
/* -------------------------------------------------------------------------- */

export type ThemePanel = {
  theme: Theme;
  /** Appearance sections — identical for every theme. */
  appearanceSchema: SettingsSchema;
  /** The theme's own sections, declared in manifest.json. */
  settingsSchema: SettingsSchema;
  widgetAreas: ThemeWidgetArea[];
  /** Resolved appearance values (manifest config over factory defaults). */
  config: Record<string, unknown>;
  /** Resolved theme-specific values (stored over schema defaults). */
  settings: Record<string, unknown>;
  isActive: boolean;
  hasManifest: boolean;
};

/** Resolve a theme by numeric id **or** slug — admin routes accept both. */
async function resolveTheme(idOrSlug: string | number): Promise<Theme> {
  const asNumber = Number(idOrSlug);
  if (Number.isInteger(asNumber) && String(idOrSlug).trim() !== "") {
    const [byId] = await db.select().from(themes).where(eq(themes.id, asNumber));
    if (byId) return byId;
  }
  const [bySlug] = await db.select().from(themes).where(eq(themes.slug, String(idOrSlug)));
  if (!bySlug) throw new NotFoundError("主题不存在");
  return bySlug;
}

/**
 * Everything `/admin/themes/[slug]` needs in one call: the two schemas, the
 * resolved values and the theme's widget areas.
 *
 * Appearance defaults cascade **factory → manifest → database**, so a ported
 * theme looks right the moment it is discovered, and the user's saved overrides
 * still win.
 */
export async function getThemePanel(idOrSlug: string | number): Promise<ThemePanel> {
  await ensureBootstrap();
  const theme = await resolveTheme(idOrSlug);
  const manifest = getThemeManifest(theme.slug);
  const settingsSchema = getThemeSettingsSchema(theme.slug);

  const baseConfig = { ...DEFAULT_THEME_CONFIG, ...(manifest?.config ?? {}) };
  const config = resolveThemeConfig({ ...baseConfig, ...theme.config });

  const [settings] = await db
    .select({ activeThemeSlug: siteSettings.activeThemeSlug })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1));

  return {
    theme,
    appearanceSchema: THEME_CONFIG_SCHEMA,
    settingsSchema,
    widgetAreas: getThemeWidgetAreas(theme.slug),
    config: config as unknown as Record<string, unknown>,
    settings: resolveSettings(settingsSchema, theme.settings),
    isActive: settings?.activeThemeSlug === theme.slug,
    hasManifest: !!manifest,
  };
}

/**
 * Save a mixed payload from the admin panel.
 *
 * Keys belonging to `THEME_CONFIG_SCHEMA` land in `themes.config` (CSS tokens);
 * everything else is coerced against the theme's own schema and stored in
 * `themes.settings`. Unknown keys are dropped, so a stale browser tab can never
 * write junk into the row.
 *
 * Palette bookkeeping: a colour token whose value is exactly what the selected
 * 配色方案 already supplies is *not* persisted. Otherwise the first palette
 * pick would bake its values into `themes.config` as if the user had hand-
 * tuned them, and every later palette switch would be silently pinned.
 */
export async function updateThemePanel(
  idOrSlug: string | number,
  payload: Record<string, unknown>,
): Promise<Theme> {
  const theme = await resolveTheme(idOrSlug);
  const configKeys = new Set(THEME_CONFIG_KEYS);
  const settingsSchema = getThemeSettingsSchema(theme.slug);

  // Which palettes the values might have come from: the one stored before this
  // save, plus the one being submitted (fall back to the stored one when the
  // payload omits `palette` entirely).
  const previousRaw = resolveSettings(settingsSchema, theme.settings).palette;
  const previousPalette =
    typeof previousRaw === "string" && previousRaw ? previousRaw : null;
  const nextRaw = payload.palette;
  const nextPalette =
    typeof nextRaw === "string" && nextRaw ? nextRaw : previousPalette;
  const palettes: (string | null)[] = [previousPalette, nextPalette];

  const configPatch: Record<string, string> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (configKeys.has(k)) {
      const s = v == null ? "" : String(v);
      // Never store "the palette said so" values as user overrides.
      if (isPaletteSupplied(k, s, palettes)) continue;
      configPatch[k] = s;
    } else {
      rest[k] = v;
    }
  }

  const settingsPatch = coerceSettings(getThemeSettingsSchema(theme.slug), rest);

  const [row] = await db
    .update(themes)
    .set({
      config: { ...theme.config, ...configPatch } as ThemeConfig,
      settings: { ...theme.settings, ...settingsPatch },
    })
    .where(eq(themes.id, theme.id))
    .returning();
  bump("theme");
  return row;
}

/**
 * Reset a theme back to its manifest values (or factory defaults for a theme
 * created by hand in the admin). Also clears theme-specific settings.
 */
export async function resetThemePanel(idOrSlug: string | number): Promise<Theme> {
  const theme = await resolveTheme(idOrSlug);
  const manifest = getThemeManifest(theme.slug);
  const [row] = await db
    .update(themes)
    .set({
      config: (manifest?.config ?? {}) as ThemeConfig,
      settings: {},
    })
    .where(eq(themes.id, theme.id))
    .returning();
  bump("theme");
  return row;
}

/**
 * Read the active theme's own settings — the accessor themes use at render
 * time, e.g. `const s = await getActiveThemeSettings(); s.heroTitle`.
 * 请求级去重：bluemix 的 Layout/HomePage/CatNav/Sidebar 每请求各调一次，
 * 底层的 schema 解析无需重复跑。
 */
export function getActiveThemeSettings(): Promise<Record<string, unknown>> {
  return publicCached(cacheKey("theme", "active-settings"), getActiveThemeSettingsUncached);
}

async function getActiveThemeSettingsUncached(): Promise<Record<string, unknown>> {
  const theme = await getActiveTheme();
  return resolveSettings(getThemeSettingsSchema(theme.slug), theme.settings);
}

/** A specific (non-active) theme's resolved settings — used by the shared engine. */
export async function getThemeSettings(slug: string): Promise<Record<string, unknown>> {
  const theme = await getThemeBySlug(slug);
  if (!theme) return {};
  return resolveSettings(getThemeSettingsSchema(theme.slug), theme.settings);
}

/**
 * 当前主题的 config 叠加用户选中的「配色方案」后的最终令牌表。
 *
 * 这是渲染 CSS 变量时应使用的入口：主题设置里的 `palette` 只是配色方案
 * 的 key，真正的颜色以预设覆盖 `themes.config` 得到。未选配色（或选了
 * 已下线的 key）时原样返回 config，保证升级后老站点零视觉变化。
 */
export function getActiveThemeRenderConfig(): Promise<ThemeConfig> {
  return publicCached(cacheKey("theme", "render-config"), getActiveThemeRenderConfigUncached);
}

async function getActiveThemeRenderConfigUncached(): Promise<ThemeConfig> {
  const [theme, settings] = await Promise.all([
    getActiveTheme(),
    getActiveThemeSettings(),
  ]);
  return applyPalette(theme.config, settings.palette as string | undefined);
}
