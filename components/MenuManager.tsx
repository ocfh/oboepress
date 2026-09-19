"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Menu as MenuIcon,
  Save,
  Plus,
  ArrowUp,
  ArrowDown,
  CornerDownRight,
  CornerUpLeft,
  Trash2,
} from "lucide-react";
import IconPicker from "./admin/IconPicker";

type Node = {
  id: number;
  label: string;
  url: string;
  type: string;
  target: string;
  icon: string | null;
  referenceSlug?: string | null;
  children: Node[];
};

type Menu = { id: number; location: string; name: string; items: Node[] };

type FlatItem = {
  id?: number;
  parentId: number | null;
  order: number;
  type: string;
  label: string;
  url: string;
  referenceSlug: string | null;
  target: string;
  icon: string | null;
  depth: number;
};

function flatten(nodes: Node[], depth = 0): FlatItem[] {
  const out: FlatItem[] = [];
  nodes.forEach((n, i) => {
    out.push({
      id: n.id,
      parentId: null,
      order: i,
      type: n.type,
      label: n.label,
      url: n.url,
      // 必须保留服务端返回的引用键；编辑保存时后端靠它实时解析链接，
      // 置空会让所有引用型菜单项退回易腐烂的 url 快照。
      referenceSlug: n.referenceSlug ?? null,
      target: n.target,
      icon: n.icon ?? null,
      depth,
    });
    if (n.children?.length) out.push(...flatten(n.children, depth + 1).map((c) => ({ ...c, parentId: n.id! })));
  });
  return out;
}

export default function MenuManager() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [flat, setFlat] = useState<FlatItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [options, setOptions] = useState<Record<string, { id: number; label: string; slug: string; url: string }[]>>({});
  // 未持久化新项的客户端临时 id（负数）；后端识别负数并映射到真实 id。
  const tempSeq = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/menus");
    const data = await res.json();
    setMenus(data);
    if (data.length && activeId == null) setActiveId(data[0].id);
  }, [activeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const m = menus.find((x) => x.id === activeId);
    if (m) setFlat(flatten(m.items));
  }, [menus, activeId]);

  async function ensureOptions(type: string) {
    if (options[type]) return;
    let url = "";
    if (type === "post") url = "/api/posts?status=published&limit=100";
    else if (type === "page") url = "/api/pages?status=published&limit=100";
    else if (type === "category") url = "/api/categories";
    else if (type === "tag") url = "/api/tags";
    else return;
    const res = await fetch(url);
    const data = await res.json();
    let list: { id: number; label: string; slug: string; url: string }[] = [];
    if (type === "post" || type === "page") {
      list = (data.items ?? []).map((p: any) => ({
        id: p.id,
        label: p.title,
        slug: p.slug,
        url: p.url,
      }));
    } else {
      list = (data ?? []).map((t: any) => ({
        id: t.id,
        label: t.name,
        slug: t.slug,
        url: t.url,
      }));
    }
    setOptions((o) => ({ ...o, [type]: list }));
  }

  // 打开菜单即预载本单用到的引用类型选项，保证 select 能回显已选目标。
  useEffect(() => {
    const types = Array.from(new Set(flat.map((it) => it.type).filter((t) => t !== "custom")));
    types.forEach((t) => ensureOptions(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat.length, activeId]);

  function update(idx: number, patch: Partial<FlatItem>) {
    setFlat((f) => f.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    const id = --tempSeq.current;
    setFlat((f) => [...f, { id, parentId: null, order: f.length, type: "custom", label: "", url: "", referenceSlug: null, target: "_self", icon: null, depth: 0 }]);
  }

  function removeItem(idx: number) {
    const target = flat[idx];
    // Also remove children
    setFlat((f) => f.filter((it, i) => i !== idx && it.parentId !== target.id));
  }

  function move(idx: number, dir: -1 | 1) {
    setFlat((f) => {
      const next = [...f];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return f;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function save() {
    if (activeId == null) return;
    setSaving(true);
    setMsg("");
    const payload = {
      items: flat.map((it, i) => ({
        id: it.id,
        parentId: it.parentId,
        order: i,
        type: it.type,
        label: it.label,
        url: it.url,
        referenceSlug: it.referenceSlug,
        target: it.target,
        icon: it.icon,
      })),
    };
    const res = await fetch(`/api/menus/${activeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("已保存 ✓");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "保存失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MenuIcon size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">菜单</h1>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? "保存中…" : "保存菜单"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {menus.map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveId(m.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
              activeId === m.id ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            <MenuIcon size={14} />
            {m.name} <span className="opacity-60">({m.location})</span>
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <div className="space-y-2">
        {flat.map((it, idx) => (
          <div
            key={idx}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            style={{ marginLeft: it.depth * 20 }}
          >
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">L{it.depth + 1}</span>
            <select
              value={it.type}
              onChange={(e) => {
                const t = e.target.value;
                // 切换类型后旧引用必然失效：清掉引用键与快照 url，避免串台
                update(idx, { type: t, referenceSlug: null, url: "" });
                ensureOptions(t);
              }}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            >
              <option value="custom">自定义链接</option>
              <option value="post">文章</option>
              <option value="page">页面</option>
              <option value="category">分类</option>
              <option value="tag">标签</option>
            </select>

            {it.type !== "custom" && (
              <select
                value={it.referenceSlug ?? ""}
                onChange={(e) => {
                  // select 以稳定的 slug 作为选中依据（与固定链接模式无关）；
                  // url 只存一份快照用于兜底，前台读时会按当前固定链接实时解析。
                  const slug = e.target.value;
                  const matched = (options[it.type] ?? []).find((o) => o.slug === slug);
                  update(idx, {
                    referenceSlug: slug || null,
                    url: matched?.url ?? "",
                    label: matched?.label ?? it.label,
                  });
                }}
                className="w-52 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
              >
                <option value="">选择{it.type === "post" ? "文章" : it.type === "page" ? "页面" : it.type === "category" ? "分类" : "标签"}…</option>
                {(options[it.type] ?? []).map((o) => (
                  <option key={o.id} value={o.slug}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}

            <input
              value={it.label}
              onChange={(e) => update(idx, { label: e.target.value })}
              placeholder="显示文字"
              title="前台显示文字，可自行修改"
              className="w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
            {it.type === "custom" && (
              <input
                value={it.url}
                onChange={(e) => update(idx, { url: e.target.value })}
                placeholder="链接 /"
                className="w-44 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
              />
            )}
            {it.type !== "custom" && (
              <span className="max-w-56 truncate font-mono text-xs text-zinc-500" title={it.url}>
                {it.referenceSlug ? it.url || "已选择" : "未选择"}
              </span>
            )}

            <IconPicker compact value={it.icon} onChange={(v) => update(idx, { icon: v })} />

            <div className="ml-auto flex gap-1 text-xs">
              <button
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                title="上移"
                className="rounded bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => move(idx, 1)}
                disabled={idx === flat.length - 1}
                title="下移"
                className="rounded bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => {
                  // 挂到「上一项」下（用上一项的真实/临时 id），深度跟随上一项。
                  const prev = flat[idx - 1];
                  if (!prev || prev.id === undefined) return;
                  update(idx, { parentId: prev.id, depth: Math.min(prev.depth + 1, 2) });
                }}
                disabled={idx === 0}
                title="作为上一项的子项"
                className="rounded bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
              >
                <CornerDownRight size={14} />
              </button>
              {it.depth > 0 && (
                <button
                  onClick={() => update(idx, { parentId: null, depth: 0 })}
                  title="升回顶级"
                  className="rounded bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700"
                >
                  <CornerUpLeft size={14} />
                </button>
              )}
              <button
                onClick={() => removeItem(idx)}
                title="删除"
                className="rounded bg-red-900 p-1.5 text-red-200 hover:bg-red-800"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addItem}
          className="inline-flex items-center gap-2 rounded-md border border-dashed border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-indigo-500 hover:text-white"
        >
          <Plus size={16} />
          添加菜单项
        </button>
      </div>
    </div>
  );
}
