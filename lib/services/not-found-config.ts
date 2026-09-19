import "server-only";
import { cache } from "react";
import { getOption, setOption } from "./options";

/**
 * 自定义 404 页（对标 WordPress 404page 类插件）。
 * 配置存 options KV（key=notFoundSettings），免迁移；前台 app/not-found.tsx
 * 与后台设置页共用此服务。
 */

const OPTION_KEY = "notFoundSettings";

export interface NotFoundSettings {
  title: string;
  /** 说明正文，纯文本按行展示。 */
  message: string;
  /** 是否显示搜索框（GET 跳转 /search）。 */
  showSearch: boolean;
  /** 是否显示最近文章链接。 */
  showRecent: boolean;
}

const DEFAULT_SETTINGS: NotFoundSettings = {
  title: "404 - 页面走丢了",
  message: "您访问的页面不存在或已被移动，请检查网址是否正确，或返回首页继续浏览。",
  showSearch: true,
  showRecent: true,
};

export const getNotFoundSettings = cache(async (): Promise<NotFoundSettings> => {
  const stored = (await getOption<Partial<NotFoundSettings>>(OPTION_KEY, {})) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
});

export async function saveNotFoundSettings(
  input: Partial<NotFoundSettings>,
): Promise<NotFoundSettings> {
  const current = await getNotFoundSettings();
  const next: NotFoundSettings = {
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim().slice(0, 120)
        : current.title,
    message:
      typeof input.message === "string"
        ? input.message.slice(0, 500)
        : current.message,
    showSearch:
      typeof input.showSearch === "boolean"
        ? input.showSearch
        : current.showSearch,
    showRecent:
      typeof input.showRecent === "boolean"
        ? input.showRecent
        : current.showRecent,
  };
  await setOption(OPTION_KEY, next);
  return next;
}
