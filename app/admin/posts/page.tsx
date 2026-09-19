import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { listPosts } from "@/lib/services/posts";
import { formatDate } from "@/lib/utils";
import PostsTable, { type PostRow } from "@/components/admin/PostsTable";

export const dynamic = "force-dynamic";

export default async function PostsAdmin() {
  const { items } = await listPosts({ limit: 50 });

  // 映射为可序列化的纯数据行，交给客户端表格承载复选框与批量操作。
  const rows: PostRow[] = items.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    scheduled:
      p.status === "draft" && p.publishedAt && p.publishedAt.getTime() > Date.now()
        ? formatDate(p.publishedAt)
        : null,
    author: p.author?.name ?? "—",
    updatedAt: formatDate(p.updatedAt),
    url: p.url,
  }));

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

      <div className="mt-6">
        <PostsTable rows={rows} />
      </div>
    </div>
  );
}
