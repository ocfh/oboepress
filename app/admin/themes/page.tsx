import { Palette } from "lucide-react";
import ThemeManager from "@/components/ThemeManager";

export default function ThemesPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Palette size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">主题</h1>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-400">
        每个主题都有独立的设置面板：
        <span className="text-indigo-400">配色 / 形状 / 排版 / 布局 / 效果 / 自定义 CSS</span>
        六组通用外观项，加上主题在 <code className="text-zinc-300">manifest.json</code> 里
        自己声明的专属选项（页头样式、首页模块、封面比例等），由 schema 自动生成表单。
        任何主题都可一键<span className="text-emerald-400">「恢复默认」</span>回到出厂配置。
      </p>
      <ThemeManager />
    </div>
  );
}
