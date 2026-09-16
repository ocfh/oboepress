"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";

/**
 * Thin client island around the server-rendered icon table: the 1539 SVG rows
 * are rendered by the server (no per-icon JS), this only handles live
 * filtering (direct DOM toggling) and delegated copy-to-clipboard.
 */
export default function IconExplorer({
  total,
  children,
}: {
  total: number;
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(total);
  const [query, setQuery] = useState("");

  function filter(value: string) {
    setQuery(value);
    const key = value.trim().toLowerCase();
    let n = 0;
    boxRef.current?.querySelectorAll<HTMLElement>("tr[data-icon]").forEach((tr) => {
      const hit = !key || (tr.dataset.search ?? "").includes(key);
      tr.classList.toggle("hidden", !hit);
      if (hit) n++;
    });
    setShown(n);
  }

  async function onTableClick(e: React.MouseEvent<HTMLDivElement>) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
    if (!btn) return;
    const value = btn.dataset.copy ?? "";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API can be unavailable on http://<lan-ip>; fallback once.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    btn.dataset.copied = "1";
    setTimeout(() => {
      delete btn.dataset.copied;
    }, 1200);
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => filter(e.target.value)}
            placeholder="搜索标识符，如 folder、book、arrow"
            className="w-80 rounded border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <span className="text-sm text-zinc-400">
          显示 <span className="text-zinc-200">{shown}</span> / {total} 个图标
        </span>
        <span className="ml-auto text-xs text-zinc-500">
          标识符为 kebab-case，点击「复制」后可粘贴到分类图标等字段
        </span>
      </div>

      <div
        ref={boxRef}
        onClick={onTableClick}
        className="mt-4 overflow-hidden rounded-lg border border-zinc-800"
      >
        {children}
      </div>

      <style>{`
        .icon-copy-btn .copy-label::before { content: "复制"; }
        .icon-copy-btn[data-copied="1"] .copy-label::before { content: "已复制 ✓"; }
        .icon-copy-btn[data-copied="1"] { color: #34d399; border-color: #065f46; }
      `}</style>
    </div>
  );
}
