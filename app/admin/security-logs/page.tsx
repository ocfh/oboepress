import Link from "next/link";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { listSecurityEvents } from "@/lib/services/security-events";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

// 事件类型即 SECURITY_EVENTS 里的字符串常量，这里集中维护中文标签与配色。
const EVENT_META: Record<string, { label: string; cls: string }> = {
  "login.success": { label: "登录成功", cls: "bg-emerald-500/15 text-emerald-300" },
  "login.fail": { label: "登录失败", cls: "bg-rose-500/15 text-rose-300" },
  "login.locked": { label: "登录锁定", cls: "bg-amber-500/15 text-amber-300" },
  "password.reset.request": { label: "申请重置密码", cls: "bg-sky-500/15 text-sky-300" },
  "password.reset.done": { label: "密码已重置", cls: "bg-indigo-500/15 text-indigo-300" },
};

const FILTERS = [
  { value: "", label: "全部事件" },
  ...Object.entries(EVENT_META).map(([value, m]) => ({ value, label: m.label })),
];

export default async function SecurityLogsPage({
  searchParams,
}: {
  searchParams: { page?: string; type?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const type = searchParams.type ?? "";
  const { items, total } = await listSecurityEvents({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    eventType: type || undefined,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) =>
    `/admin/security-logs?page=${p}${type ? `&type=${encodeURIComponent(type)}` : ""}`;

  return (
    <div>
      <div className="flex items-center gap-2">
        <ScrollText size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">安全日志</h1>
        <span className="text-sm text-zinc-500">共 {total} 条</span>
      </div>

      <form method="get" className="mt-4 flex items-center gap-2 text-sm">
        <select
          name="type"
          defaultValue={type}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-200"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-white transition hover:bg-indigo-500"
        >
          筛选
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">事件</th>
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">User-Agent / 详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {items.map((e) => {
              const meta = EVENT_META[e.eventType];
              const detail = e.detail ? JSON.stringify(e.detail) : "";
              return (
                <tr key={e.id} className="align-top hover:bg-zinc-900/50">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        meta?.cls ?? "bg-zinc-500/15 text-zinc-300"
                      }`}
                    >
                      {meta?.label ?? e.eventType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-200">
                    {e.account || "—"}
                    {e.userId ? (
                      <span className="ml-1 text-xs text-zinc-500">#{e.userId}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400">
                    {e.ip || "—"}
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <div className="truncate text-xs text-zinc-500" title={e.userAgent ?? ""}>
                      {e.userAgent || "—"}
                    </div>
                    {detail && (
                      <div className="mt-0.5 truncate font-mono text-xs text-zinc-600" title={detail}>
                        {detail}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  暂无安全事件记录。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-zinc-500">
            第 {page} / {pages} 页
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={qs(page - 1)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-900"
              >
                <ChevronLeft size={14} />
                上一页
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-600">
                <ChevronLeft size={14} />
                上一页
              </span>
            )}
            {page < pages ? (
              <Link
                href={qs(page + 1)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-900"
              >
                下一页
                <ChevronRight size={14} />
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-600">
                下一页
                <ChevronRight size={14} />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
