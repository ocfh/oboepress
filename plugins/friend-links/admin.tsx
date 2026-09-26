"use client";

/**
 * 友情链接管理面板。
 *
 * 数据（links）与展示设置都经 /api/plugins/friend-links 的 settings 合并
 * PATCH 保存，即时生效；前台有两种用法：任意页面正文放 [friendlinks] 短代码，
 * 或在下方开启免建页面的独立路由（默认 /links）。
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

const SLUG = "friend-links";

type FriendLink = {
  id: string;
  name: string;
  url: string;
  avatar?: string;
  description?: string;
  group?: string;
  visible?: boolean;
};

function uid(): string {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-indigo-500";

export default function FriendLinksAdmin() {
  const [links, setLinks] = useState<FriendLink[]>([]);
  const [columns, setColumns] = useState("3");
  const [showDescription, setShowDescription] = useState(true);
  const [openNewTab, setOpenNewTab] = useState(true);
  const [routeEnabled, setRouteEnabled] = useState(false);
  const [routePath, setRoutePath] = useState("links");
  const [pageTitle, setPageTitle] = useState("友情链接");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/plugins/${SLUG}`, { cache: "no-store" });
      const plugin = await res.json();
      const s = (plugin?.resolvedSettings ?? {}) as Record<string, unknown>;
      const raw = Array.isArray(s.links) ? (s.links as FriendLink[]) : [];
      setLinks(
        raw
          .filter((r) => r && typeof r === "object")
          .map((r) => ({
            id: String(r.id ?? uid()),
            name: String(r.name ?? ""),
            url: String(r.url ?? ""),
            avatar: r.avatar ? String(r.avatar) : "",
            description: r.description ? String(r.description) : "",
            group: r.group ? String(r.group) : "",
            visible: r.visible !== false,
          })),
      );
      setColumns(String(s.columns ?? "3"));
      setShowDescription(s.showDescription !== false);
      setOpenNewTab(s.openNewTab !== false);
      setRouteEnabled(s.routeEnabled === true);
      setRoutePath(String(s.routePath ?? "links"));
      setPageTitle(String(s.pageTitle ?? "友情链接"));
      setLoading(false);
    })();
  }, []);

  // 任意变更统一走此入口：本地立即更新 + 防抖由调用方串行 PATCH 保证。
  const persistLinks = useCallback(async (next: FriendLink[]) => {
    setLinks(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/plugins/${SLUG}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { links: next } }),
      });
      if (res.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const patchLink = useCallback(
    (id: string, patch: Partial<FriendLink>) => {
      void persistLinks(links.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [links, persistLinks],
  );

  const addLink = useCallback(() => {
    void persistLinks([
      ...links,
      { id: uid(), name: "", url: "", avatar: "", description: "", group: "", visible: true },
    ]);
  }, [links, persistLinks]);

  const removeLink = useCallback(
    (id: string) => void persistLinks(links.filter((l) => l.id !== id)),
    [links, persistLinks],
  );

  const moveBy = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= links.length) return;
      const next = [...links];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      void persistLinks(next);
    },
    [links, persistLinks],
  );

  // 展示设置单独保存。
  const persistDisplay = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      try {
        await fetch(`/api/plugins/${SLUG}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: patch }),
        });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载友链数据…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-zinc-400">
          两种展示方式：在任意页面正文插入短代码{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-indigo-300">
            [friendlinks]
          </code>
          ，或在下方开启免建页面的独立路由。短代码支持属性{" "}
          <code className="font-mono text-[11px] text-zinc-500">
            group=&quot;分组名&quot;
          </code>{" "}
          和{" "}
          <code className="font-mono text-[11px] text-zinc-500">columns=&quot;4&quot;</code>。
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
            <>共 {links.length} 条</>
          )}
        </span>
      </div>

      {/* 展示设置 */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="w-full text-sm font-semibold text-zinc-200">展示设置</h2>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          每行卡片数
          <select
            value={columns}
            onChange={(e) => {
              setColumns(e.target.value);
              void persistDisplay({ columns: e.target.value });
            }}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-indigo-500"
          >
            <option value="2">2 列</option>
            <option value="3">3 列</option>
            <option value="4">4 列</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={showDescription}
            onChange={(e) => {
              setShowDescription(e.target.checked);
              void persistDisplay({ showDescription: e.target.checked });
            }}
            className="h-3.5 w-3.5 accent-indigo-500"
          />
          显示描述文字
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={openNewTab}
            onChange={(e) => {
              setOpenNewTab(e.target.checked);
              void persistDisplay({ openNewTab: e.target.checked });
            }}
            className="h-3.5 w-3.5 accent-indigo-500"
          />
          新窗口打开
        </label>
      </section>

      {/* 独立路由 */}
      <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">独立路由</h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={routeEnabled}
            onChange={(e) => {
              setRouteEnabled(e.target.checked);
              void persistDisplay({ routeEnabled: e.target.checked });
            }}
            className="h-3.5 w-3.5 accent-indigo-500"
          />
          启用独立路由（无需新建页面，开启后自动加入 sitemap）
        </label>
        <div
          className={
            "flex flex-wrap items-end gap-x-6 gap-y-3 " +
            (routeEnabled ? "" : "pointer-events-none opacity-40")
          }
        >
          <label className="flex flex-col gap-1 text-xs text-zinc-300">
            访问路径
            <span className="flex items-center gap-1">
              <span className="text-zinc-500">/</span>
              {/* 文本逐字输入只更新本地态，失焦才 PATCH，避免每键触发全站缓存作废 */}
              <input
                value={routePath}
                onChange={(e) => setRoutePath(e.target.value)}
                onBlur={() => {
                  const clean = routePath.trim().replace(/^\/+|\/+$/g, "");
                  const next = clean && !clean.includes("/") ? clean : "links";
                  setRoutePath(next);
                  void persistDisplay({ routePath: next });
                }}
                placeholder="links"
                className={inputCls + " w-40"}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-300">
            页面标题
            <input
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              onBlur={() => {
                const next = pageTitle.trim() || "友情链接";
                setPageTitle(next);
                void persistDisplay({ pageTitle: next });
              }}
              placeholder="友情链接"
              className={inputCls + " w-40"}
            />
          </label>
          {routeEnabled &&
            routePath.trim() &&
            !routePath.trim().replace(/^\/+|\/+$/g, "").includes("/") && (
              <a
                href={"/" + routePath.trim().replace(/^\/+|\/+$/g, "")}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-300 underline-offset-2 hover:underline"
              >
                打开 /{routePath.trim().replace(/^\/+|\/+$/g, "")} ↗
              </a>
            )}
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          路径仅支持单段（不含 /），留空或非法时回退 links；与真实页面、文章或分类重名时，实体内容优先。
        </p>
      </section>

      {/* 链接列表 */}
      <section className="space-y-3">
        {links.map((l, i) => (
          <div
            key={l.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[28px_1fr_1fr]">
              <div className="flex flex-row sm:flex-col items-center gap-1">
                <button
                  title="上移"
                  disabled={i === 0 || saving}
                  onClick={() => moveBy(i, -1)}
                  className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  title="下移"
                  disabled={i === links.length - 1 || saving}
                  onClick={() => moveBy(i, 1)}
                  className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowDown size={14} />
                </button>
              </div>

              <div className="space-y-2">
                <input
                  value={l.name}
                  onChange={(e) => patchLink(l.id, { name: e.target.value })}
                  placeholder="站点名称（必填）"
                  className={inputCls}
                />
                <input
                  value={l.url}
                  onChange={(e) => patchLink(l.id, { url: e.target.value })}
                  placeholder="https://example.com（必填）"
                  className={inputCls}
                />
              </div>

              <div className="space-y-2">
                <input
                  value={l.avatar ?? ""}
                  onChange={(e) => patchLink(l.id, { avatar: e.target.value })}
                  placeholder="头像图片 URL（可留空）"
                  className={inputCls}
                />
                <input
                  value={l.group ?? ""}
                  onChange={(e) => patchLink(l.id, { group: e.target.value })}
                  placeholder="分组名（相同分组名聚合显示）"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                value={l.description ?? ""}
                onChange={(e) => patchLink(l.id, { description: e.target.value })}
                placeholder="一句话描述（可留空）"
                className={inputCls}
              />
              <button
                title={l.visible === false ? "当前隐藏，点击显示" : "当前显示，点击隐藏"}
                disabled={saving}
                onClick={() => patchLink(l.id, { visible: l.visible === false })}
                className="shrink-0 rounded p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-40"
              >
                {l.visible === false ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                title="删除"
                disabled={saving}
                onClick={() => removeLink(l.id)}
                className="shrink-0 rounded p-1.5 text-zinc-400 transition hover:bg-rose-950/60 hover:text-rose-300 disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}

        {links.length === 0 && (
          <p className="rounded-md border border-dashed border-zinc-700 px-4 py-8 text-center text-xs text-zinc-500">
            还没有友链，点击下方按钮添加第一条。
          </p>
        )}

        <button
          onClick={addLink}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 py-2.5 text-xs text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
        >
          <Plus size={14} /> 添加友链
        </button>
      </section>
    </div>
  );
}
