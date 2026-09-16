"use client";

import { useEffect, useState } from "react";
import { Folder, Tags, Plus, Trash2, GripVertical } from "lucide-react";
import IconPicker from "@/components/admin/IconPicker";
import IconGlyph from "@/components/IconGlyph";

type Item = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  parentId: number | null;
  order: number;
};

/** Group the flat list into parent rows followed by their indented children. */
function groupRows(its: Item[]): Item[] {
  const tops = its.filter((i) => i.parentId == null).slice().sort((a, b) => a.order - b.order);
  const out: Item[] = [];
  for (const t of tops) {
    out.push(t);
    const kids = its
      .filter((i) => i.parentId === t.id)
      .slice()
      .sort((a, b) => a.order - b.order);
    out.push(...kids);
  }
  return out;
}

/** In a grouped list, the contiguous block of rows that travel with `id`. */
function blockOf(rows: Item[], id: number): number[] {
  const idx = rows.findIndex((r) => r.id === id);
  const row = rows[idx];
  if (row.parentId == null) {
    const block = [row.id];
    for (let k = idx + 1; k < rows.length; k++) {
      if (rows[k].parentId === row.id) block.push(rows[k].id);
      else break;
    }
    return block;
  }
  return rows.filter((r) => r.parentId === row.parentId).map((r) => r.id);
}

export default function TaxonomyManager({ type }: { type: "category" | "tag" }) {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);

  const isCategory = type === "category";
  const endpoint = isCategory ? "/api/categories" : "/api/tags";

  const rows = groupRows(items);

  async function load() {
    const res = await fetch(endpoint);
    if (res.ok) setItems(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const payload: Record<string, unknown> = { name };
    if (slug) payload.slug = slug;
    if (isCategory) {
      if (description) payload.description = description;
      if (parentId) payload.parentId = Number(parentId);
      payload.icon = newIcon;
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setName("");
      setSlug("");
      setDescription("");
      setParentId("");
      setNewIcon(null);
      setMsg("已添加 ✓");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg((d as { error?: string }).error || "添加失败");
    }
  }

  async function remove(id: number) {
    if (!confirm("删除？")) return;
    const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  /** Save a category's icon (null clears it); optimistic UI update. */
  async function updateIcon(id: number, icon: string | null) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, icon } : c)));
    const res = await fetch(`${endpoint}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon }),
    });
    if (res.ok) {
      setMsg("图标已保存 ✓");
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg((d as { error?: string }).error || "图标保存失败");
      load();
    }
  }

  async function saveOrder(ordered: Item[]) {
    const payload = ordered.map((r, i) => ({ id: r.id, parentId: r.parentId, order: i }));
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload }),
    });
    if (res.ok) {
      setMsg("排序已保存 ✓");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg((d as { error?: string }).error || "排序保存失败");
    }
  }

  function handleDrop(target: Item) {
    if (dragId == null) return;
    const grouped = groupRows(items);
    const dragRow = grouped.find((r) => r.id === dragId);
    if (!dragRow || dragRow.parentId !== target.parentId) {
      setDragId(null);
      return;
    }
    const block = blockOf(grouped, dragId);
    const remaining = grouped.filter((r) => !block.includes(r.id));
    const tIdx = remaining.findIndex((r) => r.id === target.id);
    if (tIdx < 0) {
      setDragId(null);
      return;
    }
    const moved: Item[] = [
      ...remaining.slice(0, tIdx),
      ...block.map((id) => grouped.find((r) => r.id === id)!),
      ...remaining.slice(tIdx),
    ];
    setDragId(null);
    saveOrder(moved);
  }

  const title = isCategory ? "分类" : "标签";
  const TitleIcon = isCategory ? Folder : Tags;
  const parentOptions = items.filter((i) => i.parentId == null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <TitleIcon size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      <form
        onSubmit={add}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <div>
          <p className="mb-1 text-sm text-zinc-300">名称</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-zinc-300">别名（可选）</p>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        {isCategory && (
          <>
            <div>
              <p className="mb-1 text-sm text-zinc-300">上级分类</p>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              >
                <option value="">无（一级分类）</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-sm text-zinc-300">描述（可选）</p>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-zinc-300">图标（可选）</p>
              <IconPicker value={newIcon} onChange={setNewIcon} />
            </div>
          </>
        )}
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus size={16} />
          添加
        </button>
        {msg && <span className="text-sm text-emerald-400">{msg}</span>}
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="w-8 px-2" />
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">别名</th>
              {isCategory && <th className="px-4 py-3">描述</th>}
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((it) => {
              const isChild = it.parentId != null;
              return (
                <tr
                  key={it.id}
                  onDragOver={(e) => {
                    if (dragId != null) e.preventDefault();
                  }}
                  onDrop={() => handleDrop(it)}
                  className={isChild ? "bg-zinc-900/40" : ""}
                >
                  <td className="px-2 py-3">
                    {isCategory && (
                      <span
                        draggable
                        onDragStart={() => setDragId(it.id)}
                        onDragEnd={() => setDragId(null)}
                        title="拖动排序"
                        className="inline-flex cursor-grab touch-none items-center text-zinc-600 hover:text-zinc-300 active:cursor-grabbing"
                      >
                        <GripVertical size={16} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-2"
                      style={{ marginLeft: isChild ? "1.25rem" : 0 }}
                    >
                      {isChild && (
                        <span className="text-zinc-600 select-none">└ </span>
                      )}
                      {isCategory && it.icon ? (
                        <IconGlyph name={it.icon} size={15} className="text-zinc-500" />
                      ) : (
                        <TitleIcon size={15} className="text-zinc-500 shrink-0" />
                      )}
                      {it.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{it.slug}</td>
                  {isCategory && (
                    <td className="px-4 py-3 text-zinc-500">{it.description ?? "—"}</td>
                  )}
                  <td className="px-4 py-3 text-right">
                    {isCategory && (
                      <span className="mr-2 align-middle">
                        <IconPicker
                          compact
                          value={it.icon ?? null}
                          onChange={(v) => updateIcon(it.id, v)}
                        />
                      </span>
                    )}
                    <button
                      onClick={() => remove(it.id)}
                      className="inline-flex items-center gap-1 rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                      title="删除"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={isCategory ? 5 : 4}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  还没有{title}。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}