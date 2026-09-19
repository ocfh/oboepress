import type { Metadata } from "next";
import { getNotFoundSettings } from "@/lib/services/not-found-config";
import NotFoundScreen from "@/components/site/NotFoundScreen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "页面不存在",
  robots: { index: false, follow: false },
};

/**
 * 全局 404：catch-all 未命中实体（且不是伪装入口 / 注册页）时 notFound()
 * 最终渲染本组件。admin 子树有自己的 not-found.tsx，不受此影响。
 * 在根布局内渲染，自动套用主题外壳与页头页脚。
 */
export default async function GlobalNotFound() {
  const settings = await getNotFoundSettings();
  return <NotFoundScreen settings={settings} />;
}
