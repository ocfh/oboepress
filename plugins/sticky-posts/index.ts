import { definePlugin } from "@/lib/plugins/api";
import type { AdminMenuItem } from "@/lib/admin-extensions";

/**
 * Sticky posts ("置顶").
 *
 * The ordered id list lives in plugin settings (`ids`), maintained by the
 * custom admin panel at /admin/plugins/sticky-posts. Any settings save tears
 * down and re-runs setup (see lib/plugins/loader signature), so order changes
 * take effect on the very next request without a restart.
 *
 * Core (lib/services/posts.ts) floats these ids above date/views ordering on
 * the first page of every public published list, re-validates them against the
 * archive's own category/tag filters, and excludes them from later pages.
 */
type Settings = {
  /** Display order — index 0 is shown first. */
  ids: number[];
  /**
   * 是否在首页「智能推荐」的近期文章区块也前置置顶。
   * 默认 true；关闭后插件置顶只出现在最新文章列表与分类/标签/归档页。
   * （payload.query.context === "home" 是首页近期区块的标记。）
   */
  includeHome?: boolean;
};

export default definePlugin<Settings>({
  setup({ settings, addFilter, HOOKS }) {
    addFilter<{ query: { context?: string } | unknown; ids: number[] }>(HOOKS.postsPinned, (payload) => {
      const own = Array.isArray(settings.ids)
        ? settings.ids.filter((n) => Number.isInteger(n) && n > 0)
        : [];
      if (!own.length) return payload;
      // 用户选择首页近期区块不参与置顶：本插件对该查询不贡献任何 id。
      const q = (payload.query ?? {}) as { context?: string };
      if (settings.includeHome === false && q.context === "home") return payload;
      // This plugin owns the canonical order; other contributors append after.
      const merged = [...own];
      for (const id of payload.ids) {
        if (Number.isInteger(id) && id > 0 && !merged.includes(id)) merged.push(id);
      }
      return { ...payload, ids: merged };
    });

    addFilter<{ items: AdminMenuItem[] }>(HOOKS.adminMenu, (payload) => {
      payload.items.push({
        href: "/admin/plugins/sticky-posts",
        label: "置顶文章",
        icon: "pin",
      });
      return payload;
    });
  },
});
