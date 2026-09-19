"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import DeleteButton from "@/components/DeleteButton";

/** 服务端列表页映射好的纯数据行（日期已格式化为字符串，可直接跨边界传递）。 */
export type PostRow = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  /** 定时徽章文案，非定时文章为 null。 */
  scheduled: string | null;
  author: string;
  updatedAt: string;
  url: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};

type Action = "publish" | "draft" | "archive" | "delete";

export default function PostsTable({ rows }: { rows: PostRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const allChecked = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAction(action: Action) {
    if (selected.size === 0) return;
    if (
      action === "delete" &&
      !confirm(`确定删除选中的 ${selected.size} 篇文章吗？此操作不可撤销。`)
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      if (!res.ok) {
        alert("批量操作失败，请重试");
        return;
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded border px-2.5 py-1 text-xs transition disabled:opacity-50 border-zinc-700 text-zinc-300 hover:bg-zinc-800";

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-900 bg-indigo-950/40 px-4 py-2.5 text-sm">
          <span className="text-zinc-300">已选 {selected.size} 篇</span>
          <div className="ml-auto flex items-center gap-2">
            <button className={btn} disabled={busy} onClick={() => runAction("publish")}>
              发布
            </button>
            <button className={btn} disabled={busy} onClick={() => runAction("draft")}>
              转草稿
            </button>
            <button className={btn} disabled={busy} onClick={() => runAction("archive")}>
              归档
            </button>
            <button
              className="rounded border border-red-900 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-950 disabled:opacity-50"
              disabled={busy}
              onClick={() => runAction("delete")}
            >
              删除
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="全选"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-indigo-600"
                />
              </th>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">作者</th>
              <th className="px-4 py-3">更新</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-900/50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`选择 ${p.title}`}
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/posts/${p.id}`}
                    className="inline-flex items-center gap-2 text-zinc-100 hover:text-indigo-400"
                  >
                    <FileText size={15} className="text-zinc-500" />
                    {p.title}
                  </Link>
                  <div className="ml-7 text-xs text-zinc-500">/{p.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      p.status === "published"
                        ? "text-emerald-400"
                        : p.status === "archived"
                          ? "text-zinc-500"
                          : "text-amber-400"
                    }
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  {p.scheduled && (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                      定时 {p.scheduled}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">{p.author}</td>
                <td className="px-4 py-3 text-zinc-500">{p.updatedAt}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={p.url}
                    target="_blank"
                    className="mr-2 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-indigo-400"
                    title="查看"
                  >
                    <ExternalLink size={14} />
                    查看
                  </Link>
                  <DeleteButton endpoint={`/api/posts/${p.id}`} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  还没有文章。点击右上角“新建文章”。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
