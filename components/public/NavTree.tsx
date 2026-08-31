import Link from "next/link";
import type { MenuNode } from "@/lib/services/menus";

/** Recursively render a navigation menu (used in header + footer). */
export default function NavTree({
  nodes,
  className = "",
}: {
  nodes: MenuNode[];
  className?: string;
}) {
  if (!nodes.length) return null;
  return (
    <ul className={className}>
      {nodes.map((n) => (
        <li key={n.id} className="group relative">
          <Link
            href={n.url}
            target={n.target === "_blank" ? "_blank" : undefined}
            className="block px-3 py-2 text-sm text-zinc-300 transition hover:text-white"
          >
            {n.label}
          </Link>
          {n.children.length > 0 && (
            <ul className="absolute left-0 top-full z-20 hidden min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl group-hover:block">
              {n.children.map((c) => (
                <li key={c.id}>
                  <Link
                    href={c.url}
                    target={c.target === "_blank" ? "_blank" : undefined}
                    className="block px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
