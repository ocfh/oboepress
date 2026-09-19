"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Palette, Plus, Settings2, Trash2 } from "lucide-react";
import PackageUpload from "@/components/PackageUpload";
import type { Theme } from "@/db/schema";

type ThemeMeta = {
  description?: string;
  version?: string;
  author?: string;
  homepage?: string | null;
  updatedAt?: string | null;
};

type ThemeWithActive = Theme & { active: boolean; meta?: ThemeMeta | null };

/**
 * Theme list: activate / create / delete.
 *
 * All per-theme tuning (design tokens **and** the theme's own manifest options)
 * lives on `/admin/themes/[slug]` so there is exactly one editor, driven by the
 * declarative schema — this component deliberately keeps no duplicate form.
 */
export default function ThemeManager() {
  const [themes, setThemes] = useState<ThemeWithActive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    const [t, s] = await Promise.all([
      fetch("/api/themes", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
    ]);
    const activeSlug = s?.activeThemeSlug;
    setThemes(
      (t?.themes ?? t ?? []).map(
        (th: Theme & { meta?: ThemeMeta | null }) => ({
          ...th,
          active: th.slug === activeSlug,
        }),
      ),
    );
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  async function setActive(id: number) {
    const theme = themes.find((t) => t.id === id);
    if (!theme) return;
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeThemeSlug: theme.slug }),
    });
    if (res.ok) load();
    else setError("操作失败");
  }

  async function remove(id: number) {
    if (!confirm("确定删除该主题？")) return;
    const res = await fetch(`/api/themes/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else setError("删除失败");
  }

  async function createTheme() {
    if (!newName.trim()) return;
    const base = themes.find((t) => t.active) ?? themes[0];
    const res = await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, config: base?.config ?? {} }),
    });
    if (res.ok) {
      setNewName("");
      load();
    } else setError("创建失败");
  }

  return (
    <div>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新主题名称"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          onClick={createTheme}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus size={16} />
          新建主题（复制当前配置）
        </button>
      </div>

      <div className="mb-6">
        <PackageUpload kind="theme" onInstalled={() => void load()} />
      </div>

      {loading ? (
        <p className="text-zinc-400">加载中…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`rounded-lg border p-4 transition ${
                theme.active
                  ? "border-emerald-700/60 bg-emerald-950/15"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: theme.config.accent ?? "#818cf8",
                    color: theme.config.accentText ?? "#fff",
                    borderRadius: theme.config.radius ?? "12px",
                  }}
                >
                  <Palette size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-zinc-100">{theme.name}</p>
                    {theme.meta?.version && (
                      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                        v{theme.meta.version}
                      </span>
                    )}
                  </div>
                  {theme.meta?.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                      {theme.meta.description}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                    <span className="font-mono text-[10px] text-zinc-600">
                      themes/{theme.slug}
                      {theme.isDefault && " · 内置"}
                    </span>
                    {/* 作者名即网址入口：homepage 合法时渲染为新标签页超链接 */}
                    {theme.meta?.author &&
                      (theme.meta.homepage && /^https?:\/\//i.test(theme.meta.homepage) ? (
                        <a
                          href={theme.meta.homepage}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-indigo-400 transition hover:text-indigo-300 hover:underline"
                        >
                          {theme.meta.author}
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span>{theme.meta.author}</span>
                      ))}
                    {theme.meta?.updatedAt && (
                      <span className="text-zinc-600">更新于 {theme.meta.updatedAt}</span>
                    )}
                  </div>
                  {theme.active && (
                    <span className="mt-1.5 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      当前生效
                    </span>
                  )}
                </div>
              </div>

              {/* Token strip — a glance tells you what the theme looks like. */}
              <div className="mt-3 flex gap-1">
                {(
                  [
                    theme.config.background,
                    theme.config.surface,
                    theme.config.accent,
                    theme.config.text,
                    theme.config.muted,
                    theme.config.border,
                  ] as (string | undefined)[]
                ).map((c, i) => (
                  <span
                    key={i}
                    title={c}
                    className="h-4 flex-1 rounded border border-zinc-800"
                    style={{ background: c || "transparent" }}
                  />
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!theme.active && (
                  <button
                    onClick={() => setActive(theme.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500"
                  >
                    <Check size={14} />
                    设为当前
                  </button>
                )}
                <Link
                  href={`/admin/themes/${theme.slug}`}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-indigo-500 hover:text-indigo-300"
                >
                  <Settings2 size={14} />
                  主题设置
                </Link>
                {themes.length > 1 && !theme.isDefault && (
                  <button
                    onClick={() => remove(theme.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-900 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-950"
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
