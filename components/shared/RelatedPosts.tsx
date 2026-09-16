import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { getRelatedPosts } from "@/lib/services/archives";
import { formatDate } from "@/lib/utils";

/**
 * Related posts ranked by shared taxonomy (see getRelatedPosts).
 * Server component — reads are cheap and the section is never empty
 * (falls back to latest posts).
 */
export default async function RelatedPosts({ postId }: { postId: number }) {
  const related = await getRelatedPosts(postId, 4);
  if (related.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-100">
        <FolderOpen size={18} className="text-[var(--accent)]" />
        相关文章
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {related.map((p) => (
          <Link
            key={p.id}
            href={`/blog/${p.slug}`}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]"
          >
            <h3 className="line-clamp-2 font-medium text-zinc-100 transition group-hover:text-[var(--accent)]">
              {p.title}
            </h3>
            {p.publishedAt && (
              <p className="mt-2 text-xs text-zinc-500">{formatDate(p.publishedAt)}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
