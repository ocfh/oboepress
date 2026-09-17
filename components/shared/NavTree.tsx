import Link from "next/link";
import type { MenuNode } from "@/lib/services/menus";

/** Recursively render a navigation menu (used in header + footer). */
export default function NavTree({
  nodes,
  className = "",
  renderIcon,
}: {
  nodes: MenuNode[];
  className?: string;
  /**
   * Optional server-side icon renderer for a menu node. Return null when the
   * node has no usable icon. NavTree itself is an RSC, so callers may pass a
   * function that renders server-only icon components. Themes that don't opt in
   * simply omit it and keep the original text-only look.
   */
  renderIcon?: (node: MenuNode) => React.ReactNode;
}) {
  if (!nodes.length) return null;
  return (
    <ul className={className}>
      {nodes.map((n) => (
        <li key={n.id} className="group relative">
          <Link
            href={n.url}
            target={n.target === "_blank" ? "_blank" : undefined}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-300 transition hover:text-white"
          >
            {renderIcon ? renderIcon(n) : null}
            {n.label}
          </Link>
          {n.children.length > 0 && (
            <ul className="absolute left-0 top-full z-20 hidden min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl group-hover:block">
              {n.children.map((c) => (
                <li key={c.id}>
                  <Link
                    href={c.url}
                    target={c.target === "_blank" ? "_blank" : undefined}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                  >
                    {renderIcon ? renderIcon(c) : null}
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
