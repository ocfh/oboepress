import Link from "next/link";
import { FileText, Plus, ExternalLink } from "lucide-react";
import { listPosts } from "@/lib/services/posts";
import { formatDate } from "@/lib/utils";
import DeleteButton from "@/components/DeleteButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};

export default async function PostsAdmin() {
  const { items } = await listPosts({ limit: 50 });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">文章</h1>
        </div>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <Plus size={16} />
          新建文章
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">作者</th>
              <th className="px-4 py-3">更新</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-900/50">
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
                </td>
                <td className="px-4 py-3 text-zinc-400">{p.author?.name ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(p.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/blog/${p.slug}`}
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
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
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
