"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plug,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { SchemaForm } from "@/components/SettingsFields";
import PackageUpload from "@/components/PackageUpload";
import type { SettingsSchema } from "@/lib/settings-schema";

type PluginView = {
  slug: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  installed: boolean;
  hasEntry: boolean;
  hasAdmin?: boolean;
  settings: Record<string, unknown>;
  resolvedSettings: Record<string, unknown>;
  manifest: {
    settings?: SettingsSchema;
    hooks?: string[];
    homepage?: string;
    updatedAt?: string;
  } | null;
};

export default function PluginManager() {
  const [items, setItems] = useState<PluginView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<PluginView | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/plugins", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setItems(
      Array.isArray(json.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(p: PluginView) {
    setBusy(p.slug);
    await fetch(`/api/plugins/${p.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    setBusy(null);
    setMsg(`${p.name} 已${p.enabled ? "停用" : "启用"}`);
    await load();
  }

  async function saveSettings() {
    if (!editing) return;
    setBusy(editing.slug);
    await fetch(`/api/plugins/${editing.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: draft }),
    });
    setBusy(null);
    setEditing(null);
    setMsg("设置已保存");
    await load();
  }

  async function rescan() {
    setBusy("__scan__");
    await fetch("/api/plugins", { method: "POST" });
    setBusy(null);
    setMsg("已重新扫描 plugins/ 目录");
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载插件…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          已安装 <span className="text-indigo-400">{items.length}</span> 个插件，
          其中 <span className="text-emerald-400">{items.filter((i) => i.enabled).length}</span> 个已启用
        </p>
        <button
          onClick={rescan}
          disabled={busy === "__scan__"}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
        >
          <RefreshCw size={13} className={busy === "__scan__" ? "animate-spin" : ""} />
          重新扫描
        </button>
      </div>

      <div className="mb-4">
        <PackageUpload kind="plugin" onInstalled={() => void load()} />
      </div>

      {msg && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 size={14} /> {msg}
        </div>
      )}

      {!items.length && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-10 text-center">
          <Plug size={28} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-400">
            还没有插件。把插件文件夹放进项目根目录的 <code className="text-indigo-400">plugins/</code>，
            然后点「重新扫描」。
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((p) => {
          const schema = p.manifest?.settings ?? [];
          const hasVisibleFields = schema.some((s) =>
            s.fields.some((f) => f.type !== "hidden" && f.type !== "group"),
          );
          return (
            <div
              key={p.slug}
              className={`rounded-lg border p-4 transition ${
                p.enabled
                  ? "border-indigo-700/60 bg-indigo-950/20"
                  : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-zinc-100">{p.name}</h3>
                    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      v{p.version}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                    {p.description || "（无描述）"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                    <span className="font-mono text-[10px] text-zinc-600">plugins/{p.slug}</span>
                    {/* 作者名即网址入口：homepage 合法时渲染为新标签页超链接 */}
                    {p.author &&
                      (p.manifest?.homepage && /^https?:\/\//i.test(p.manifest.homepage) ? (
                        <a
                          href={p.manifest.homepage}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-indigo-400 transition hover:text-indigo-300 hover:underline"
                        >
                          {p.author}
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span>{p.author}</span>
                      ))}
                    {p.manifest?.updatedAt && (
                      <span className="text-zinc-600">更新于 {p.manifest.updatedAt}</span>
                    )}
                  </div>
                  {!p.hasEntry && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-400">
                      <AlertTriangle size={12} /> 缺少 index.ts 入口文件
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggle(p)}
                  disabled={busy === p.slug || !p.hasEntry}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                    p.enabled
                      ? "border border-zinc-700 text-zinc-300 hover:border-rose-500 hover:text-rose-400"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  }`}
                >
                  {busy === p.slug ? "…" : p.enabled ? "停用" : "启用"}
                </button>
              </div>

              {(hasVisibleFields || p.hasAdmin) && (
                <div className="mt-3 flex items-center gap-4">
                  {hasVisibleFields && (
                    <button
                      onClick={() => {
                        setEditing(p);
                        setDraft({ ...p.resolvedSettings });
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-400 transition hover:text-indigo-300"
                    >
                      <Settings2 size={13} /> 插件设置
                    </button>
                  )}
                  {p.hasAdmin && p.enabled && (
                    <Link
                      href={`/admin/plugins/${p.slug}`}
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 transition hover:text-emerald-300"
                    >
                      <ExternalLink size={13} /> 管理面板
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6">
          <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">{editing.name} · 设置</h2>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  plugins/{editing.slug}
                </p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <SchemaForm
              schema={editing.manifest?.settings ?? []}
              values={draft}
              onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
            />

            <div className="mt-6 flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={saveSettings}
                disabled={busy === editing.slug}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy === editing.slug ? "保存中…" : "保存设置"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
