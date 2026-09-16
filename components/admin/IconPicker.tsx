"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, SmilePlus } from "lucide-react";
import { LUCIDE_ICON_NAMES, lucidePascalName } from "@/lib/icon-names";
import IconGlyph from "@/components/IconGlyph";

const PAGE = 72;

/**
 * Lucide icon picker: a compact trigger plus a searchable modal grid.
 * Glyph previews come from prebuilt static SVGs (/public/icons) rendered via
 * IconGlyph (CSS mask), so this client component only ships the 1539 *names*
 * (strings), never the icon components.
 */
export default function IconPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return LUCIDE_ICON_NAMES;
    return LUCIDE_ICON_NAMES.filter(
      (n) => n.includes(key) || lucidePascalName(n).toLowerCase().includes(key),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setLimit(PAGE);
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setLimit(PAGE);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLimit((l) => Math.min(l + PAGE, filtered.length));
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [open, filtered.length]);

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={value ? `图标：${value}（点击更换）` : "设置图标"}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-700 text-zinc-300 hover:border-indigo-500 hover:text-indigo-300"
        >
          {value ? (
            <IconGlyph name={value} size={16} />
          ) : (
            <SmilePlus size={14} />
          )}
        </button>
        {open && (
          <PickerModal
            value={value}
            query={query}
            setQuery={setQuery}
            filtered={filtered}
            limit={limit}
            sentinelRef={sentinelRef}
            searchRef={searchRef}
            onClose={() => setOpen(false)}
            onPick={(n) => {
              onChange(n);
              setOpen(false);
            }}
            onClear={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-[13rem] items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-indigo-500"
      >
        {value ? (
          <>
            <IconGlyph name={value} size={18} />
            <span className="font-mono text-[13px] text-indigo-300">{value}</span>
          </>
        ) : (
          <>
            <SmilePlus size={16} className="shrink-0 text-zinc-500" />
            <span className="text-zinc-500">选择图标（可选）</span>
          </>
        )}
      </button>
      {open && (
        <PickerModal
          value={value}
          query={query}
          setQuery={setQuery}
          filtered={filtered}
          limit={limit}
          sentinelRef={sentinelRef}
          searchRef={searchRef}
          onClose={() => setOpen(false)}
          onPick={(n) => {
            onChange(n);
            setOpen(false);
          }}
          onClear={() => {
            onChange(null);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function PickerModal({
  value,
  query,
  setQuery,
  filtered,
  limit,
  sentinelRef,
  searchRef,
  onClose,
  onPick,
  onClear,
}: {
  value: string | null;
  query: string;
  setQuery: (v: string) => void;
  filtered: readonly string[];
  limit: number;
  sentinelRef: React.RefObject<HTMLDivElement>;
  searchRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onPick: (name: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 p-4">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索图标标识符…"
              className="w-full rounded border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <span className="shrink-0 text-xs text-zinc-500">{filtered.length} 个</span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title="关闭 (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">没有匹配的图标</p>
          ) : (
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
              {filtered.slice(0, limit).map((name) => {
                const active = name === value;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => onPick(name)}
                    className={`group flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border p-1 transition ${
                      active
                        ? "border-indigo-500 bg-indigo-950/50"
                        : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/60"
                    }`}
                  >
                    <IconGlyph
                      name={name}
                      size={20}
                      className={
                        active
                          ? "text-indigo-300"
                          : "text-zinc-400 group-hover:text-zinc-200"
                      }
                    />
                    <span className="w-full truncate text-center text-[9px] leading-none text-zinc-500 group-hover:text-zinc-300">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div ref={sentinelRef} className="h-4" />
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <span className="truncate font-mono text-xs text-zinc-400">
            {value ? `当前：${value}` : "未选择图标"}
          </span>
          <button
            type="button"
            onClick={onClear}
            disabled={!value}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            清除图标
          </button>
        </div>
      </div>
    </div>
  );
}
