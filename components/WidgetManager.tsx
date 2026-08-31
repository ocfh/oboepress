"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { SchemaForm } from "@/components/SettingsFields";
import { resolveSettings, type SettingsSchema } from "@/lib/settings-schema";

/**
 * Widget ("小工具" / nvPress "主题模块") placement manager.
 *
 * Areas come from the active theme's manifest, types from the widget registry
 * plus anything plugins registered via the `widget.types` filter. Each instance
 * renders its own settings through the shared schema form, so adding a new
 * widget type never requires touching this file.
 */

type AreaDef = { key: string; label: string; description?: string };
type TypeDef = {
  type: string;
  label: string;
  description: string;
  icon: string;
  settings: SettingsSchema;
};
type WidgetRow = {
  id: number;
  area: string;
  type: string;
  title: string;
  order: number;
  enabled: boolean;
  config: Record<string, unknown>;
  themeSlug: string;
};

export default function WidgetManager({ themes }: { themes: { slug: string; name: string }[] }) {
  const [theme, setTheme] = useState(themes[0]?.slug ?? "");
  const [areas, setAreas] = useState<AreaDef[]>([]);
  const [types, setTypes] = useState<TypeDef[]>([]);
  const [rows, setRows] = useState<WidgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<WidgetRow | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    if (!theme) return;
    setLoading(true);
    const res = await fetch(`/api/widgets?theme=${encodeURIComponent(theme)}`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    setAreas(Array.isArray(json.areas) ? json.areas : []);
    setTypes(Array.isArray(json.types) ? json.types : []);
    setRows(Array.isArray(json.widgets) ? json.widgets : []);
    setLoading(false);
  }, [theme]);

  useEffect(() => {
    void load();
  }, [load]);

  const typeMap = useMemo(
    () => Object.fromEntries(types.map((t) => [t.type, t])),
    [types],
  );

  async function add(area: string, type: string) {
    setBusy(true);
    const def = typeMap[type];
    await fetch("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area, type, themeSlug: theme, title: def?.label ?? "" }),
    });
    setBusy(false);
    setAdding(null);
    await load();
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/widgets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    await load();
  }

  async function remove(id: number) {
    if (!confirm("确定删除这个小工具？")) return;
    setBusy(true);
    await fetch(`/api/widgets/${id}`, { method: "DELETE" });
    setBusy(false);
    await load();
  }

  /** Move an item within its area and persist the whole area's order. */
  async function move(area: string, id: number, dir: -1 | 1) {
    const list = rows
      .filter((r) => r.area === area)
      .sort((a, b) => a.order - b.order);
    const i = list.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    // Optimistic reorder so the arrow click feels instant.
    setRows((prev) =>
      prev.map((r) => {
        const k = list.findIndex((x) => x.id === r.id);
        return k >= 0 ? { ...r, order: k + 1 } : r;
      }),
    );
    setBusy(true);
    await fetch("/api/widgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: list.map((r) => r.id) }),
    });
    setBusy(false);
    await load();
  }

  function openEditor(w: WidgetRow) {
    const schema = typeMap[w.type]?.settings ?? [];
    setEditing(w);
    setDraftTitle(w.title);
    setDraft(resolveSettings(schema, w.config));
  }

  async function saveEditor() {
    if (!editing) return;
    await patch(editing.id, { title: draftTitle, config: draft });
    setEditing(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载小工具…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">配置主题</span>
          <div className="relative">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="appearance-none rounded-md border border-zinc-700 bg-zinc-900 py-1.5 pl-3 pr-8 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            >
              {themes.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          小工具按主题独立保存，切换主题不会丢失另一套布局
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {areas.map((area) => {
          const list = rows
            .filter((r) => r.area === area.key)
            .sort((a, b) => a.order - b.order);
          return (
            <section
              key={area.key}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="mb-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
                    <LayoutGrid size={14} className="text-indigo-400" />
                    {area.label}
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                      {area.key}
                    </span>
                  </h3>
                  <span className="text-[11px] text-zinc-500">{list.length} 项</span>
                </div>
                {area.description && (
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    {area.description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {list.map((w, i) => {
                  const def = typeMap[w.type];
                  return (
                    <div
                      key={w.id}
                      className={`rounded-md border px-3 py-2 transition ${
                        w.enabled
                          ? "border-zinc-700 bg-zinc-900"
                          : "border-zinc-800 bg-zinc-900/40 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            onClick={() => move(area.key, w.id, -1)}
                            disabled={i === 0 || busy}
                            className="text-zinc-500 transition hover:text-indigo-400 disabled:opacity-20"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            onClick={() => move(area.key, w.id, 1)}
                            disabled={i === list.length - 1 || busy}
                            className="text-zinc-500 transition hover:text-indigo-400 disabled:opacity-20"
                          >
                            <ChevronDown size={13} />
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-200">
                            {w.title || def?.label || w.type}
                          </p>
                          <p className="font-mono text-[10px] text-zinc-600">{w.type}</p>
                        </div>
                        <button
                          onClick={() => patch(w.id, { enabled: !w.enabled })}
                          title={w.enabled ? "隐藏" : "显示"}
                          className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          {w.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          onClick={() => openEditor(w)}
                          title="设置"
                          className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-indigo-400"
                        >
                          <Settings2 size={14} />
                        </button>
                        <button
                          onClick={() => remove(w.id)}
                          title="删除"
                          className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-rose-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {!list.length && (
                  <p className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-center text-[11px] text-zinc-600">
                    该区域为空
                  </p>
                )}
              </div>

              {adding === area.key ? (
                <div className="mt-3 rounded-md border border-indigo-800/60 bg-indigo-950/20 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">选择类型</span>
                    <button
                      onClick={() => setAdding(null)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="grid max-h-56 gap-1 overflow-y-auto">
                    {types.map((t) => (
                      <button
                        key={t.type}
                        onClick={() => add(area.key, t.type)}
                        disabled={busy}
                        className="rounded px-2 py-1.5 text-left transition hover:bg-zinc-800 disabled:opacity-50"
                      >
                        <span className="text-xs text-zinc-200">{t.label}</span>
                        <span className="ml-2 text-[10px] text-zinc-500">
                          {t.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(area.key)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 py-1.5 text-xs text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-400"
                >
                  <Plus size={13} /> 添加小工具
                </button>
              )}
            </section>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6">
          <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">
                  {typeMap[editing.type]?.label ?? editing.type}
                </h2>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  {editing.area} · {editing.type}
                </p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                标题
              </label>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="留空则不显示标题"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>

            <SchemaForm
              schema={typeMap[editing.type]?.settings ?? []}
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
                onClick={saveEditor}
                disabled={busy}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
