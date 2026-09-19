import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plugins, type Plugin } from "@/db/schema";
import {
  discoverPlugins,
  getPluginManifest,
  pluginHasAdmin,
  pluginHasEntry,
  type PluginManifest,
} from "@/lib/plugins/registry";
import { invalidatePluginCache, loadPlugins } from "@/lib/plugins/loader";
import { coerceSettings, resolveSettings } from "@/lib/settings-schema";
import { ensureBootstrap } from "./bootstrap";
import { NotFoundError, ValidationError } from "./errors";
import { bumpAll } from "./public-cache";
import { installPackage } from "./package-install";

export type PluginView = Plugin & {
  manifest: PluginManifest | null;
  /** Present on disk? A row can outlive a deleted folder. */
  installed: boolean;
  hasEntry: boolean;
  /** Ships a custom admin page at plugins/<slug>/admin.tsx. */
  hasAdmin: boolean;
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

/**
 * 从上传的 zip 安装插件：校验 plugin.json + 入口、落盘 plugins/<slug>、
 * 同步入库（默认停用，绝不自动执行第三方代码）。不合规抛 ValidationError，
 * 临时文件与半成品目录由安装器清理。
 */
export async function installPluginZip(buf: Buffer): Promise<PluginView> {
  await ensureBootstrap();
  const info = installPackage("plugin", buf);
  invalidatePluginCache();
  await syncPlugins();
  bumpAll();
  try {
    return await getPlugin(info.slug);
  } catch {
    throw new ValidationError("插件已落盘但同步失败，请检查 plugin.json");
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
      hasAdmin: !!manifest && pluginHasAdmin(row.slug),
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
  pluginsReady = false;
  await ensurePluginsLoaded();
  // 插件可改写任意内容过滤器（置顶、小工具、head 等），启停后全站缓存作废。
  bumpAll();
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
  pluginsReady = false;
  await ensurePluginsLoaded();
  bumpAll();
  return getPlugin(slug);
}

/**
 * Ensure every enabled plugin has been imported and had its hooks registered.
 * Call this at the top of any request path that renders content or fires hooks.
 *
 * Warm requests cost nothing: after the first successful load a process-local
 * flag short-circuits until something mutates plugins (enable/disable/settings
 * save), and concurrent cold requests coalesce onto one in-flight promise.
 */
let pluginsReady = false;
let pluginsInflight: Promise<void> | null = null;

export function ensurePluginsLoaded(): Promise<void> {
  if (pluginsReady) return Promise.resolve();
  if (pluginsInflight) return pluginsInflight;
  pluginsInflight = (async () => {
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
    pluginsReady = true;
  })().finally(() => {
    pluginsInflight = null;
  });
  return pluginsInflight;
}

/**
 * 丢弃插件缓存并立即重新装载全部已启用插件。用于备份整库恢复等绕过了正常
 * 写服务、plugins 表可能已整体改变的场景（普通启停/设置保存在各自服务函数
 * 内已自行失效，无需调用这里）。
 */
export async function reloadPlugins(): Promise<void> {
  invalidatePluginCache();
  pluginsReady = false;
  await ensurePluginsLoaded();
}
