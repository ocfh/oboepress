import { eq } from "drizzle-orm";
import { db, ensureMigrations } from "../../db";
import {
  siteSettings,
  themes,
  menus,
  menuItems,
  plugins,
  type ThemeConfig,
} from "../../db/schema";
import { discoverThemes } from "@/themes/registry";
import { discoverPlugins } from "@/lib/plugins/registry";
import { syncThemes } from "@/lib/services/themes";

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

/** Idempotently seed default site settings, themes + menus. Cheap + safe to call per request. */
export async function ensureBootstrap(): Promise<void> {
  if (bootstrapped) return;
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().then(
      () => {
        bootstrapped = true;
        bootstrapPromise = null;
      },
      (err) => {
        bootstrapPromise = null;
        throw err;
      },
    );
  }
  return bootstrapPromise;
}

async function runBootstrap(): Promise<void> {
  await ensureMigrations();
  await db.insert(siteSettings).values({ id: 1 }).onConflictDoNothing();

  // Clean up legacy themes
  await db.delete(themes).where(eq(themes.slug, "liquid-glass"));
  // Clean up the old hyphenated theme slug after the oboe-press -> oboepress rename
  await db.delete(themes).where(eq(themes.slug, "oboe-press-2026"));

  // Auto-discover themes from themes/ directory and register them. syncThemes()
  // upserts every folder that ships a manifest.json and prunes rows whose folder
  // was deleted from disk — so the admin list always reflects the filesystem.
  await syncThemes();

  // Auto-discover plugins from plugins/ directory. Newly found plugins are
  // registered *disabled* — code is never activated behind the user's back.
  for (const p of discoverPlugins()) {
    await db
      .insert(plugins)
      .values({
        slug: p.slug,
        name: p.name,
        description: p.description ?? "",
        version: p.version ?? "1.0.0",
        author: p.author ?? "",
        enabled: false,
      })
      .onConflictDoUpdate({
        target: plugins.slug,
        set: {
          name: p.name,
          description: p.description ?? "",
          version: p.version ?? "1.0.0",
          author: p.author ?? "",
        },
      });
  }

  // Seed default menus
  const DEFAULT_MENUS = [
    {
      location: "header",
      name: "顶部导航",
      // 顶部导航条目都配图标（图标带 6px 右间距）。
      // "house" (not "home"): lucide renamed Home → House, and CatIcon silently
      // renders null for names outside the icon-names whitelist.
      items: [{ label: "首页", url: "/", order: 1, icon: "house" }],
    },
    {
      location: "footer",
      name: "底部导航",
      items: [{ label: "首页", url: "/", order: 1 }],
    },
  ];

  for (const m of DEFAULT_MENUS) {
    const [row] = await db
      .insert(menus)
      .values({ location: m.location, name: m.name })
      .onConflictDoNothing({ target: menus.location })
      .returning();
    if (row && m.items.length) {
      await db.insert(menuItems).values(
        m.items.map((it) => ({
          menuId: row.id,
          label: it.label,
          url: it.url,
          order: it.order,
          icon: "icon" in it ? (it.icon ?? null) : null,
        })),
      );
    }
  }

  // Set default active theme — but never point it at a folder that no longer exists.
  const [settings] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1));
  const activeSlug = settings?.activeThemeSlug || "";
  const discovered = discoverThemes();
  const activeStillThere = discovered.some((t) => t.slug === activeSlug);
  const legacySlug =
    !activeSlug || activeSlug === "liquid-glass" || activeSlug === "oboe-press-2026";
  if (legacySlug || !activeStillThere) {
    const fallback = discovered.find((t) => t.isDefault) ?? discovered[0] ?? null;
    if (fallback) {
      await db
        .update(siteSettings)
        .set({ activeThemeSlug: fallback.slug })
        .where(eq(siteSettings.id, 1));
    }
  }
}
