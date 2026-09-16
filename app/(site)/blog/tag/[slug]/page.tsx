import Link from "next/link";
import { notFound } from "next/navigation";
import { listPosts } from "@/lib/services/posts";
import { getTagBySlug } from "@/lib/services/taxonomies";
import PostCard from "@/components/shared/PostCard";
import Sidebar from "@/components/shared/Sidebar";

export const dynamic = "force-dynamic";

export default async function TagPage({ params }: { params: { slug: string } }) {
  const decodedSlug = safeDecode(params.slug);
  const tag = await getTagBySlug(decodedSlug);
  if (!tag) notFound();

  const { items } = await listPosts({ status: "published", tagSlug: decodedSlug, limit: 12 });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-6">
          <Link href="/" className="text-sm text-zinc-400 hover:text-[var(--accent)]">
            ← 首页
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-zinc-100">标签：#{tag.name}</h1>
        </div>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-zinc-400">
            该标签下还没有文章。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
      <Sidebar />
    </div>
  );
}

/** Next app-router passes non-ASCII dynamic segments URI-encoded; decode once. */
function safeDecode(slug: string): string {
  if (/%[0-9A-Fa-f]{2}/.test(slug)) {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  }
  return slug;
}
