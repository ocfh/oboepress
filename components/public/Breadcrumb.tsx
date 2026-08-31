import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb trail. The last item is rendered as plain text (current page).
 * Server component — no client state needed.
 */
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="面包屑"
      className="flex flex-wrap items-center gap-1 text-xs text-zinc-500"
    >
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="inline-flex items-center gap-1">
            {c.href && !last ? (
              <Link href={c.href} className="transition hover:text-[var(--accent)]">
                {c.label}
              </Link>
            ) : (
              <span className={last ? "text-zinc-300" : undefined}>{c.label}</span>
            )}
            {!last && <ChevronRight size={12} className="text-zinc-600" />}
          </span>
        );
      })}
    </nav>
  );
}
