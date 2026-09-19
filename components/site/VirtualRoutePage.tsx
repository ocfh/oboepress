/**
 * 插件虚拟路由的通用正文外壳（服务端组件）。
 *
 * 虚拟页不属于任何主题，但根布局已用当前主题的 PublicLayout 套好导航与页脚，
 * 这里只负责一块主题中性的正文：沿用 bluemix 的 container-np 限宽约定
 * （其它主题不认识该类名，max-width 兜底同样生效），颜色全部走 CSS 变量并给
 * 明暗两套回退，插件对自己的 HTML 自带样式（如友链卡片墙）。
 */
import type { VirtualSiteRoute } from "@/lib/services/virtual-routes";

export default function VirtualRoutePage({ route }: { route: VirtualSiteRoute }) {
  return (
    <div
      className="container-np"
      style={{ padding: "40px 16px 64px", maxWidth: 1200, marginInline: "auto" }}
    >
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 8,
          color: "var(--text-color, var(--foreground, #18181b))",
        }}
      >
        {route.title}
      </h1>
      <div
        // 插件正文（友链卡片墙等），HTML 由插件自身转义生成。
        dangerouslySetInnerHTML={{ __html: route.html }}
      />
    </div>
  );
}
