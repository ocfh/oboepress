import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

// 导出范围说明集中维护，与 app/api/admin/export 的白名单对应。
const SCOPES = [
  { key: "posts", label: "文章", desc: "全部文章，含草稿、定时与归档，及分类标签关联与 SEO 字段" },
  { key: "pages", label: "独立页面", desc: "全部独立页面及自定义元数据" },
  { key: "comments", label: "评论", desc: "全部状态的评论" },
  { key: "taxonomies", label: "分类与标签", desc: "分类、标签的名称与别名" },
  { key: "settings", label: "站点设置", desc: "后台全部站点配置项" },
];

const cardCls = "rounded-lg border border-zinc-800 bg-zinc-900/40 p-4";
const inputCls = "h-4 w-4 accent-indigo-600";

export default function ExportPage() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2">
        <Download size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">内容导出</h1>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        选择需要导出的内容范围与格式，导出文件由浏览器直接下载，可用于备份或迁移。
      </p>

      {/* 原生 GET 表单：接口以 Content-Disposition 附件返回，页面不会跳转 */}
      <form
        method="get"
        action="/api/admin/export"
        className="mt-6 space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/30 p-6"
      >
        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">导出范围</h2>
          <div className="space-y-2">
            {SCOPES.map((s) => (
              <label key={s.key} className={`flex cursor-pointer items-start gap-3 ${cardCls}`}>
                <input
                  type="checkbox"
                  name="scope"
                  value={s.key}
                  defaultChecked
                  className={`mt-0.5 ${inputCls}`}
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-100">{s.label}</span>
                  <span className="block text-xs text-zinc-500">{s.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">导出格式</h2>
          <div className="flex gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="format" value="json" defaultChecked className={inputCls} />
              <span>
                JSON
                <span className="ml-1 text-xs text-zinc-500">完整备份 / 迁移用</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="format" value="markdown" className={inputCls} />
              <span>
                Markdown
                <span className="ml-1 text-xs text-zinc-500">阅读 / 二次编辑用</span>
              </span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <Download size={16} />
          下载导出文件
        </button>
      </form>
    </div>
  );
}
