import { LayoutGrid } from "lucide-react";
import WidgetManager from "@/components/WidgetManager";
import { getActiveTheme, listThemes } from "@/lib/services/themes";

export const dynamic = "force-dynamic";

export default async function WidgetsPage() {
  const [all, active] = await Promise.all([listThemes(), getActiveTheme()]);
  // Put the active theme first so the picker opens on what visitors see.
  const themes = [
    ...all.filter((t) => t.slug === active.slug),
    ...all.filter((t) => t.slug !== active.slug),
  ].map((t) => ({
    slug: t.slug,
    name: t.slug === active.slug ? `${t.name}（当前启用）` : t.name,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <LayoutGrid size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">小工具</h1>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-400">
        把小工具拖放到主题声明的<span className="text-indigo-400">「区域」</span>里
        —— 侧边栏、页脚以及主题自定义的模块位。每个小工具都有自己的设置项，
        由类型声明自动生成表单。侧边栏需要在
        <span className="text-emerald-400">「主题 → 布局 → 侧边栏位置」</span>
        中先选择左侧或右侧才会显示。
      </p>
      <WidgetManager themes={themes} />
    </div>
  );
}
