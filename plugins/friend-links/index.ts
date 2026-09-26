/**
 * 友情链接插件：
 * - 链接数据存插件 settings.links（hidden 字段，自定义 admin 面板管理），零迁移；
 * - 注册 [friendlinks] 短代码，可放在任意页面正文，支持 group / columns 属性；
 * - 可开关的独立虚拟路由（默认 /links）：无需新建页面，经核心 site.routes
 *   过滤器认领，开启后同时写入 sitemap；
 * - 注册后台侧边栏入口 /admin/plugins/friend-links。
 *
 * 卡片用中性半透明配色而非 var(--surface)：bluemix 等主题未覆盖
 * --surface/--border，半透明灰在深浅背景下都不突兀。
 */
import { definePlugin, type PluginContext } from "@/lib/plugins/api";
import { HOOKS, addFilter } from "@/lib/hooks";
import { registerShortcode, type ShortcodeDefinition } from "@/lib/shortcodes";
import type { AdminMenuItem } from "@/lib/admin-extensions";
import type { SiteRoutesPayload } from "@/lib/services/virtual-routes";
import type { SitemapPayload } from "@/lib/services/sitemap";

export type FriendLink = {
  id: string;
  name: string;
  url: string;
  avatar?: string;
  description?: string;
  group?: string;
  visible?: boolean;
};

type FriendLinkSettings = {
  links: FriendLink[];
  columns: string;
  showDescription: boolean;
  openNewTab: boolean;
  /** 是否启用免建页面的独立虚拟路由。 */
  routeEnabled: boolean;
  /** 虚拟路由单段路径，如 links → /links。 */
  routePath: string;
  /** 虚拟路由页面标题。 */
  pageTitle: string;
};

/** 路由路径只接受单段 slug：去首尾斜杠后若含斜杠/为空则回退 links。 */
function normalizeRoutePath(raw: unknown): string {
  const v = String(raw ?? "links").trim().replace(/^\/+|\/+$/g, "");
  if (!v || v.includes("/")) return "links";
  return v;
}

/** 从 resolveSettings 的宽松结果里取规范化设置。 */
function readSettings(raw: Record<string, unknown>): FriendLinkSettings {
  const links = Array.isArray(raw.links) ? (raw.links as FriendLink[]) : [];
  return {
    links,
    columns: String(raw.columns ?? "3"),
    // 存储为布尔；默认开。
    showDescription: raw.showDescription !== false,
    openNewTab: raw.openNewTab !== false,
    routeEnabled: raw.routeEnabled === true,
    routePath: normalizeRoutePath(raw.routePath),
    pageTitle: String(raw.pageTitle ?? "友情链接").trim() || "友情链接",
  };
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 作用域内样式：hover 上浮、圆角头像、移动端两列、胶囊跳转钮。 */
const STYLE = `
.oboe-fl-wrap{display:grid;gap:6px;margin:24px 0}
.oboe-fl-group{margin:18px 0 4px;font-size:1.02rem;font-weight:700}
.oboe-fl-grid{display:grid;gap:12px}
.oboe-fl-empty{opacity:.6;text-align:center;padding:36px 0}
@media(max-width:640px){.oboe-fl-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
.oboe-fl-card{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:18px 12px 14px;border-radius:14px;background:rgba(127,127,127,.07);border:1px solid rgba(127,127,127,.22);color:inherit;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
.oboe-fl-card:hover{transform:translateY(-3px);border-color:var(--primary-color,var(--accent,#818cf8));box-shadow:0 6px 18px rgba(0,0,0,.08)}
.oboe-fl-avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;border:1px solid rgba(127,127,127,.25)}
.oboe-fl-fallback{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;background:var(--primary-color,var(--accent,#818cf8));color:#fff}
.oboe-fl-desc{font-size:.78rem;opacity:.65;line-height:1.4;word-break:break-word}
/* 设计规格：跳转按钮 .button.style-theme 胶囊：
   主色 20% 底 + 白色上浮渐变、内白描边、顶部高光条、主色辉光，hover 转 30% */
.oboe-fl-btn{margin-top:auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 16px 4px;border-radius:9em;font-size:13px;line-height:1.5;text-decoration:none;color:var(--primary-color,#1f8bff);position:relative;transition:background-color .25s ease;background-color:var(--primary-opacity-2,rgba(31,139,255,.2));background-image:linear-gradient(rgba(255,255,255,0) 65%,rgba(255,255,255,.75));box-shadow:0 0 0 1px #fff inset,0 8px 10px rgba(85,120,161,.05),0 8px 10px var(--primary-opacity-2,rgba(31,139,255,.2)),0 0 5px var(--primary-opacity-2,rgba(31,139,255,.2))}
.oboe-fl-btn:before{content:"";position:absolute;left:.5em;right:.5em;top:0;height:50%;border-radius:9em;background:linear-gradient(rgba(255,255,255,.9),rgba(255,255,255,.3));box-shadow:0 1px #fff inset;pointer-events:none}
.oboe-fl-btn:hover{background-color:var(--primary-opacity-3,rgba(31,139,255,.3))}
.oboe-fl-btn svg{position:relative;z-index:1;width:12px;height:12px;fill:currentColor}
.oboe-fl-btn span{position:relative;z-index:1}
`;

function renderCard(
  link: FriendLink,
  showDescription: boolean,
  openNewTab: boolean,
): string {
  const target = openNewTab ? ' target="_blank" rel="noopener noreferrer"' : "";
  const media = link.avatar
    ? `<img class="oboe-fl-avatar" src="${esc(link.avatar)}" alt="${esc(link.name)}" loading="lazy">`
    : `<span class="oboe-fl-fallback">${esc((link.name || "?").slice(0, 1))}</span>`;
  const desc =
    showDescription && link.description
      ? `<small class="oboe-fl-desc">${esc(link.description)}</small>`
      : "";
  // 卡片容器不再承担链接（禁止 <a> 嵌套）：唯一跳转入口是底部胶囊按钮，
  // 星形图标 + 站点名。
  return `<div class="oboe-fl-card">${media}${desc}<a class="oboe-fl-btn" href="${esc(link.url)}"${target}><svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>${esc(link.name)}</span></a></div>`;
}

type RenderAttrs = { group?: string; columns?: string };

/**
 * 短代码与虚拟路由共用的卡片墙渲染。
 * 短代码在无可见链接时返回空串（页面不出现无意义块）；虚拟路由传
 * allowEmpty=true，输出空态提示——站长开启路由后面对的不是 404。
 */
function renderLinksHtml(
  s: FriendLinkSettings,
  attrs: RenderAttrs,
  allowEmpty: boolean,
): string {
  // 仅展示未显式隐藏的链接；group 属性可只渲染某个分组。
  const groupFilter = (attrs.group ?? "").trim();
  const visible = s.links.filter(
    (l) => l.visible !== false && (!groupFilter || (l.group ?? "") === groupFilter),
  );
  if (visible.length === 0) {
    return allowEmpty
      ? `<style>${STYLE}</style><div class="oboe-fl-wrap"><p class="oboe-fl-empty">还没有添加友情链接。</p></div>`
      : "";
  }

  // 属性 columns 优先，其次设置；夹在 1-4。
  const wanted = parseInt(attrs.columns || s.columns, 10);
  const cols = Math.min(4, Math.max(1, Number.isFinite(wanted) ? wanted : 3));

  // 按首次出现顺序保序分组。
  const groups: { name: string; items: FriendLink[] }[] = [];
  const index = new Map<string, number>();
  for (const link of visible) {
    const name = (link.group ?? "").trim();
    const at = index.get(name);
    if (at === undefined) {
      index.set(name, groups.length);
      groups.push({ name, items: [link] });
    } else {
      groups[at].items.push(link);
    }
  }

  // 无分组名（全部未分组）时不渲染组标题。
  const showGroups = groups.length > 1 || groups[0]?.name;
  const body = groups
    .map(
      (g) =>
        (showGroups && g.name
          ? `<h3 class="oboe-fl-group">${esc(g.name)}</h3>`
          : "") +
        `<div class="oboe-fl-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">` +
        g.items.map((l) => renderCard(l, s.showDescription, s.openNewTab)).join("") +
        `</div>`,
    )
    .join("");

  return `<style>${STYLE}</style><div class="oboe-fl-wrap">${body}</div>`;
}

export default definePlugin({
  slug: "friend-links",

  setup(ctx: PluginContext) {
    const definition: ShortcodeDefinition = {
      name: "friendlinks",
      description: "友情链接卡片墙",
      example: '[friendlinks group="朋友们" columns="4"]',
      render: (attrs) => renderLinksHtml(readSettings(ctx.settings), attrs, false),
    };

    // 渲染管线在 expand 前先 ensurePluginsLoaded，直接注册到全局 Map 即可。
    registerShortcode(definition);

    // 独立虚拟路由认领：首个设置 route 的插件胜出，已被认领直接放行。
    // 实体 / 伪装后台入口 / 注册页在核心侧优先于本钩子，这里顶不掉它们。
    addFilter<SiteRoutesPayload>(HOOKS.siteRoutes, (payload) => {
      if (payload.route) return payload;
      const s = readSettings(ctx.settings);
      if (!s.routeEnabled) return payload;
      if (payload.segments.length === 1 && payload.segments[0] === s.routePath) {
        payload.route = {
          title: s.pageTitle,
          html: renderLinksHtml(s, {}, true),
          path: "/" + s.routePath,
        };
      }
      return payload;
    });

    // 开启路由时把页面写入 sitemap（低频低优先级）。
    addFilter<SitemapPayload>(HOOKS.sitemapUrls, (payload) => {
      const s = readSettings(ctx.settings);
      if (s.routeEnabled) {
        payload.entries.push({
          loc: `${payload.base}/${s.routePath}`,
          changefreq: "weekly",
          priority: "0.3",
        });
      }
      return payload;
    });

    addFilter<{ items: AdminMenuItem[] }>(HOOKS.adminMenu, (payload) => {
      payload.items.push({
        href: "/admin/plugins/friend-links",
        label: "友情链接",
        icon: "link",
      });
      return payload;
    });
  },
});
