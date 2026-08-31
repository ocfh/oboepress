import { Plug } from "lucide-react";
import PluginManager from "@/components/PluginManager";

export const dynamic = "force-dynamic";

export default function PluginsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Plug size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">插件</h1>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-zinc-400">
        插件是可插拔的扩展单元：把文件夹放进项目根目录的
        <code className="mx-1 rounded bg-zinc-800 px-1.5 py-0.5 text-indigo-400">plugins/</code>
        即被识别，启用后其注册的钩子立即生效，<span className="text-zinc-300">核心代码零改动</span>。
        新发现的插件默认<span className="text-amber-400">停用</span>，不会擅自执行第三方代码。
      </p>
      <PluginManager />
    </div>
  );
}
