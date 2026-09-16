"use client";

import { useEffect, useState } from "react";

type Heading = { id: string; text: string; level: number };

function slugifyText(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "section";
}

/**
 * Blog post table of contents.
 *
 * Unlike DocToc (which receives pre-computed headings), this component walks
 * the already-rendered article (`<div class="prose-cms">`), assigns stable ids
 * to every h2/h3, and highlights the active one on scroll. Works for any HTML
 * the block renderer produces — no server-side heading extraction required.
 */
export default function PostToc({ selector = ".prose-cms" }: { selector?: string }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const root = document.querySelector(selector);
    if (!root) return;

    const els = Array.from(root.querySelectorAll("h2, h3")) as HTMLElement[];
    const seen = new Map<string, number>();
    const collected: Heading[] = els.map((el) => {
      let id = el.id || slugifyText(el.textContent ?? "");
      // De-duplicate ids so anchor links stay unique.
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      el.id = id;
      return {
        id,
        text: (el.textContent ?? "").trim(),
        level: el.tagName === "H2" ? 2 : 3,
      };
    });
    setHeadings(collected);

    if (collected.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    collected.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [selector]);

  if (headings.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">目录</h3>
      <ul className="space-y-1 border-l border-[var(--border)]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`block py-0.5 text-sm transition ${
                h.level === 3 ? "pl-7" : "pl-4"
              } ${
                activeId === h.id
                  ? "border-l-2 border-[var(--accent)] text-[var(--accent)] -ml-px"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
