import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/services/settings";
import { getActiveThemeRenderConfig } from "@/lib/services/themes";
import { resolveThemeConfig } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * PWA 清单（零依赖）。名称 / 描述取站点设置，主题色取当前主题叠加配色方案
 * 后的 accent，图标取 Favicon / Logo 原图（sizes 声明 any，浏览器自行缩放）。
 * Next 识别到本文件后会自动向所有页面注入 <link rel="manifest">。
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [settings, renderConfig] = await Promise.all([
    getSettings(),
    getActiveThemeRenderConfig(),
  ]);
  const accent = resolveThemeConfig(renderConfig).accent;

  const icons: MetadataRoute.Manifest["icons"] = [];
  for (const src of [settings.faviconUrl, settings.logoUrl]) {
    if (!src || icons.some((i) => i.src === src)) continue;
    icons.push({ src, sizes: "any", type: guessImageType(src) });
  }

  return {
    name: settings.siteTitle || "OboePress",
    short_name: (settings.siteTitle || "OboePress").slice(0, 12),
    description: settings.tagline || settings.siteDescription || "",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: settings.language || "zh-CN",
    background_color: "#ffffff",
    theme_color: accent,
    icons,
  };
}

/** 按扩展名猜 MIME；识别不了就省略 type，浏览器按内容嗅探。 */
function guessImageType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "ico":
      return "image/x-icon";
    default:
      return "";
  }
}
