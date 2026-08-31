import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Generic numbered pagination. `hrefFor(page)` builds the link for a 1-based
 * page number; pass `totalPages <= 1` to render nothing.
 */
export default function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  // Show a window of pages around the current one.
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="分页">
      {page > 1 && (
        <Link
          href={hrefFor(page - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-zinc-300 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <ChevronLeft size={15} />
          上一页
        </Link>
      )}

      {start > 1 && (
        <>
          <PageLink page={1} current={page} hrefFor={hrefFor} />
          {start > 2 && <span className="px-1 text-zinc-500">…</span>}
        </>
      )}

      {pages.map((p) => (
        <PageLink key={p} page={p} current={page} hrefFor={hrefFor} />
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-zinc-500">…</span>}
          <PageLink page={totalPages} current={page} hrefFor={hrefFor} />
        </>
      )}

      {page < totalPages && (
        <Link
          href={hrefFor(page + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-zinc-300 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          下一页
          <ChevronRight size={15} />
        </Link>
      )}
    </nav>
  );
}

function PageLink({
  page,
  current,
  hrefFor,
}: {
  page: number;
  current: number;
  hrefFor: (page: number) => string;
}) {
  const active = page === current;
  return (
    <Link
      href={hrefFor(page)}
      aria-current={active ? "page" : undefined}
      className={`min-w-9 rounded-lg border px-3 py-2 text-center text-sm transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--border)] text-zinc-300 hover:border-[var(--accent)] hover:text-[var(--accent)]"
      }`}
    >
      {page}
    </Link>
  );
}
