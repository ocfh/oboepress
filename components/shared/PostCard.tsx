import Link from "next/link";
import { User, Calendar, MessageCircle } from "lucide-react";
import type { PostListItem } from "@/lib/services/posts";
import { formatDate } from "@/lib/utils";

export default function PostCard({ post }: { post: PostListItem }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]">
      {post.featuredImage ? (
        <Link href={post.url} className="block aspect-[16/9] overflow-hidden">
          <img
            src={post.featuredImage}
            alt={post.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </Link>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          {post.categories.slice(0, 2).map((c) => (
            <Link
              key={c.id}
              href={c.url}
              className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-[var(--accent)]"
            >
              {c.name}
            </Link>
          ))}
        </div>
        <h2 className="text-lg font-semibold leading-snug text-[var(--text)]">
          <Link href={post.url} className="transition group-hover:text-[var(--accent)]">
            {post.title}
          </Link>
        </h2>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 flex-1 text-sm text-[var(--muted)]">{post.excerpt}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <User size={13} />
            {post.author?.name ?? "未知作者"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar size={13} />
            {formatDate(post.publishedAt)}
          </span>
          {post.commentsCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={13} />
              {post.commentsCount} 评论
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
