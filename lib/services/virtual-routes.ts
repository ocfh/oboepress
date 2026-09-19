/**
 * 插件虚拟公开路由。
 *
 * 文章 / 独立页面 / 分类 / 标签都由真实实体支撑，链接走固定链接网关；但有些
 * 插件功能（友情链接墙、留言板、关于卡片）需要一个「不存在实体表」的公开
 * URL。这类路径由插件通过 `site.routes` 异步过滤器认领：
 *
 *   ctx.addFilter(HOOKS.siteRoutes, async ({ segments, route }) => {
 *     if (route) return { segments, route };           // 已被别的插件认领
 *     if (segments[0] === "links") {
 *       return { segments, route: { title, html, path: "/links" } };
 *     }
 *     return { segments, route: null };
 *   });
 *
 * 解析顺序（见 catch-all page）：实体 → 伪装后台入口 → 会员注册页 → 虚拟路由
 * → 404。因此虚拟路径永远顶不掉真实内容和用户自定义的敏感入口。
 */
import { applyAsyncFilters, HOOKS } from "@/lib/hooks";
import { ensurePluginsLoaded } from "./plugins";

/** 插件认领成功后回填的路由描述。 */
export type VirtualSiteRoute = {
  /** 页面展示标题（<h1>，亦作为 <title> 的回退）。 */
  title: string;
  /** 插件自行渲染好的正文 HTML（可含一次 <style>）。 */
  html: string;
  /** 根相对规范路径，如 /links，用于 canonical 与 SEO。 */
  path: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
};

export type SiteRoutesPayload = {
  /** catch-all 拆出的 URL 段，如 ["links"]。 */
  segments: string[];
  /** 前序插件已认领时非空；后续过滤器应直接放行。 */
  route: VirtualSiteRoute | null;
};

/**
 * 让已启用插件依次尝试认领当前路径。无插件认领返回 null（调用方按 404 处理）。
 * 每次调用都先确保插件已加载；热路径上 ensurePluginsLoaded 仅一次布尔判断。
 */
export async function resolveVirtualRoute(
  segments: string[],
): Promise<VirtualSiteRoute | null> {
  await ensurePluginsLoaded();
  const out = await applyAsyncFilters<SiteRoutesPayload>(HOOKS.siteRoutes, {
    segments,
    route: null,
  });
  return out.route;
}
