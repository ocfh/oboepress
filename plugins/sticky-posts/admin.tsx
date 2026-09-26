"use client";

/**
 * Sticky-posts admin panel.
 *
 * Two stacks: the ordered "pinned" list (up/down + jump-to-position controls
 * on the left, unpin on the right) and the full post catalogue below with
 * search and one-click pinning. Every mutation PATCHes { settings: { ids } }
 * immediately, so the front desk reflects it on the next request.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Pin,
  PinOff,
  Search,
} from "lucide-react";

const SLUG = "sticky-posts";
const PAGE_SIZE = 100;

type PostRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  views: number;
  publishedAt: string | null;
  createdAt: string;
};

function fmt(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: "bg-emerald-950/60 text-emerald-300 border-emerald-800",
    draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  const label: Record<string, string> = { published: "已发布", draft: "草稿" };
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
        map[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

export default function StickyPostsAdmin() {
  const [ids, setIds] = useState<number[]>([]);
  // 置顶是否也作用于首页「智能推荐」近期文章区块，默认作用（true）
  const [includeHome, setIncludeHome] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [kw, setKw] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    let offset = 0;
    const collected: PostRow[] = [];
    let plugin: Record<string, unknown> = {};
    let grandTotal = 0;
    for (;;) {
      const res = await fetch(`/api/posts?limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: "no-store",
      });
      // /api/posts returns listPosts() unchanged: { items, total }.
      const json = await res.json();
      const items: PostRow[] = Array.isArray(json?.items) ? json.items : [];
      if (offset === 0) {
        grandTotal = typeof json?.total === "number" ? json.total : items.length;
        // /api/plugins/<slug> returns the PluginView unchanged.
        const pres = await fetch(`/api/plugins/${SLUG}`, { cache: "no-store" });
        plugin = (await pres.json()) ?? {};
      }
      collected.push(...items);
      offset += items.length;
      if (items.length < PAGE_SIZE || collected.length >= grandTotal) break;
    }
    setPosts(collected);
    setTotal(grandTotal);
    const resolved = (plugin.resolvedSettings ?? {}) as { ids?: unknown; includeHome?: unknown };
    const stored = Array.isArray(resolved.ids) ? resolved.ids : [];
    setIds(stored.filter((n): n is number => Number.isInteger(n) && (n as number) > 0));
    setIncludeHome(resolved.includeHome !== false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const persist = useCallback(
    async (next: number[], home = includeHome) => {
      setIds(next);
      setSaving(true);
      try {
        const res = await fetch(`/api/plugins/${SLUG}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // 显式带上 includeHome，避免只发 ids 时设置被整体替换丢失开关
          body: JSON.stringify({ settings: { ids: next, includeHome: home } }),
        });
        if (res.ok) {
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 1500);
        }
      } finally {
        setSaving(false);
      }
    },
    [includeHome],
  );

  const toggleHome = useCallback(
    async (next: boolean) => {
      setIncludeHome(next);
      setSaving(true);
      try {
        const res = await fetch(`/api/plugins/${SLUG}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: { ids, includeHome: next } }),
        });
        if (res.ok) {
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 1500);
        }
      } finally {
        setSaving(false);
      }
    },
    [ids],
  );

  const pinPost = useCallback(
    (id: number) => {
      if (!ids.includes(id)) void persist([...ids, id]);
    },
    [ids, persist],
  );

  const unpin = useCallback(
    (id: number) => void persist(ids.filter((x) => x !== id)),
    [ids, persist],
  );

  const moveBy = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= ids.length) return;
      const next = [...ids];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      void persist(next);
    },
    [ids, persist],
  );

  const jumpTo = useCallback(
    (index: number, position1Based: number) => {
      const clamped = Math.min(Math.max(position1Based, 1), ids.length);
      if (clamped === index + 1) return;
      const next = [...ids];
      const [item] = next.splice(index, 1);
      next.splice(clamped - 1, 0, item);
      void persist(next);
    },
    [ids, persist],
  );

  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  const pinnedRows = ids
    .map((id) => byId.get(id))
    .filter((p): p is PostRow => Boolean(p));

  const q = kw.trim().toLowerCase();
  const catalogue = useMemo(() => {
    const pinnedSet = new Set(ids);
    const list = posts.filter((p) => !pinnedSet.has(p.id));
    if (!q) return list;
    return list.filter(
      (p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [posts, ids, q]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载文章列表…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          置顶文章按下方顺序显示在前台所有已发布文章列表的最前面，
          <span className="text-zinc-200">优先级高于发布时间</span>
          （最新/最旧排序均生效）；仅在所属分类/标签归档内出现。
        </p>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" /> 保存中…
            </>
          ) : savedFlash ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 size={13} /> 已保存
            </span>
          ) : (
            <>共 {total} 篇文章</>
          )}
        </span>
      </div>

      {/* 作用域：是否包含首页智能推荐的近期文章区块 */}
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-indigo-500"
          checked={includeHome}
          disabled={saving}
          onChange={(e) => void toggleHome(e.target.checked)}
        />
        置顶同时显示在首页「智能推荐」的近期文章区块
        <span className="text-xs text-zinc-500">（关闭后仅在最新文章列表与归档页前置）</span>
      </label>

      {/* Pinned, ordered */}
      <section className="rounded-lg border border-indigo-800/50 bg-indigo-950/10 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-300">
          <Pin size={15} /> 已置顶（{ids.length}）
          <span className="font-normal text-zinc-500">— 左侧按钮调整顺序</span>
        </h2>
        {pinnedRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-700 px-4 py-6 text-center text-xs text-zinc-500">
            还没有置顶文章，从下方列表点击「置顶」即可。
          </p>
        ) : (
          <ul className="space-y-2">
            {pinnedRows.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2"
              >
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    title="上移一位"
                    disabled={i === 0 || saving}
                    onClick={() => moveBy(i, -1)}
                    className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <input
                    title="移到第几位（回车确认）"
                    type="number"
                    min={1}
                    max={ids.length}
                    defaultValue={i + 1}
                    key={`${p.id}-${i}`}
                    disabled={saving || ids.length < 2}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) jumpTo(i, Math.round(n));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="w-11 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-center text-xs text-zinc-200 outline-none focus:border-indigo-500 disabled:opacity-40"
                  />
                  <button
                    title="下移一位"
                    disabled={i === ids.length - 1 || saving}
                    onClick={() => moveBy(i, 1)}
                    className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                  {p.title || "（无标题）"}
                </span>
                <StatusBadge status={p.status} />
                <span className="shrink-0 font-mono text-[11px] text-zinc-500">#{p.id}</span>
                <span className="hidden w-20 shrink-0 text-right text-[11px] text-zinc-500 sm:block">
                  {fmt(p.publishedAt)}
                </span>
                <button
                  title="取消置顶"
                  disabled={saving}
                  onClick={() => unpin(p.id)}
                  className="shrink-0 rounded p-1.5 text-zinc-400 transition hover:bg-rose-950/60 hover:text-rose-300 disabled:opacity-40"
                >
                  <PinOff size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Full catalogue */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">全部文章</h2>
          <div className="relative w-64">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索标题或链接别名…"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-1.5 pl-8 pr-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-indigo-500"
            />
          </div>
        </div>

        {catalogue.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-700 px-4 py-6 text-center text-xs text-zinc-500">
            {q ? "没有匹配的文章" : "全部文章都已置顶"}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {catalogue.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                  {p.title || "（无标题）"}
                </span>
                <StatusBadge status={p.status} />
                <span className="shrink-0 font-mono text-[11px] text-zinc-500">#{p.id}</span>
                <span className="hidden w-20 shrink-0 text-right text-[11px] text-zinc-500 sm:block">
                  {fmt(p.publishedAt)}
                </span>
                <button
                  disabled={saving}
                  onClick={() => pinPost(p.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-40"
                >
                  <Pin size={12} /> 置顶
                </button>
              </li>
            ))}
          </ul>
        )}

        {!q && posts.length < total && (
          <button
            onClick={async () => {
              setLoadingMore(true);
              const res = await fetch(
                `/api/posts?limit=${PAGE_SIZE}&offset=${posts.length}`,
                { cache: "no-store" },
              );
              const json = await res.json();
              setPosts((prev) => [...prev, ...((json?.items as PostRow[]) ?? [])]);
              setLoadingMore(false);
            }}
            disabled={loadingMore}
            className="mt-3 w-full rounded-md border border-dashed border-zinc-700 py-2 text-xs text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
          >
            {loadingMore ? "加载中…" : `加载更多（已显示 ${posts.length}/${total}）`}
          </button>
        )}
      </section>
    </div>
  );
}
