import { Shapes } from "lucide-react";
import { LUCIDE_ICON_NAMES, lucidePascalName } from "@/lib/icon-names";
import { getLucideIcon } from "@/lib/lucide-icon";
import IconExplorer from "@/components/admin/IconExplorer";

export const dynamic = "force-dynamic";

export const metadata = { title: "图标库" };

/**
 * Admin icon library: every built-in Lucide icon (identifiers are kebab-case)
 * rendered as a server table. Backend users look icons up here, copy the
 * identifier, and use it in fields such as the category icon.
 */
export default function IconsAdminPage() {
  const rows = LUCIDE_ICON_NAMES.map((kebab) => ({
    kebab,
    pascal: lucidePascalName(kebab),
  }));

  return (
    <div>
      <div className="flex items-center gap-2">
        <Shapes size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">图标库</h1>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        系统内置 {rows.length} 个 Lucide 图标，标识符统一使用 kebab-case（如{" "}
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">folder-open</code>
        ）。在分类等支持图标的位置填写标识符即可使用。
      </p>

      <div className="mt-6">
        <IconExplorer total={rows.length}>
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="w-16 px-4 py-3">图标</th>
                <th className="px-4 py-3">标识符</th>
                <th className="px-4 py-3">组件名</th>
                <th className="w-28 px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map(({ kebab, pascal }) => {
                const Comp = getLucideIcon(kebab);
                return (
                  <tr
                    key={kebab}
                    data-icon={kebab}
                    data-search={`${kebab} ${pascal} ${kebab.replace(/-/g, " ")}`.toLowerCase()}
                    className="hover:bg-zinc-900/60"
                  >
                    <td className="px-4 py-2.5 text-zinc-300">
                      {Comp ? <Comp size={17} /> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[13px] text-indigo-300">{kebab}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[13px] text-zinc-500">{pascal}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        data-copy={kebab}
                        className="icon-copy-btn inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        <span className="copy-label" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </IconExplorer>
      </div>
    </div>
  );
}
