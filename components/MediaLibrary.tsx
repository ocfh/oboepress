"use client";

import { useEffect, useRef, useState } from "react";
import {
  Images,
  Upload,
  Trash2,
  File as FileIcon,
  Copy,
  Check,
  Pencil,
  X,
  ZoomIn,
  Loader2,
  AlertCircle,
} from "lucide-react";

type MediaItem = {
  id: number;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string | null;
};

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/media?limit=200");
      if (res.ok) {
        const d = await res.json();
        setItems(d.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(e?: React.FormEvent) {
    e?.preventDefault();
    if (!file) return;
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("alt", alt);
    const res = await fetch("/api/media", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) {
      setFile(null);
      setAlt("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMsg({ text: "上传成功 ✓", ok: true });
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg({ text: d.error || "上传失败", ok: false });
    }
  }

  async function remove(id: number) {
    if (!confirm("删除该媒体？此操作不可恢复。")) return;
    setBusyIds((s) => new Set(s).add(id));
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    setBusyIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    if (res.ok) {
      setItems((list) => list.filter((m) => m.id !== id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } else {
      setMsg({ text: "删除失败", ok: false });
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`确认删除选中的 ${selected.size} 个媒体？此操作不可恢复。`)) return;
    const ids = Array.from(selected);
    setBusyIds((s) => new Set([...s, ...ids]));
    const res = await fetch(`/api/media?ids=${ids.join(",")}`, { method: "DELETE" });
    setBusyIds((s) => {
      const n = new Set(s);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    if (res.ok) {
      const d = await res.json();
      const deleted: number[] = d.deleted ?? ids;
      setItems((list) => list.filter((m) => !deleted.includes(m.id)));
      setSelected(new Set());
      setMsg({ text: `已删除 ${deleted.length} 个媒体`, ok: true });
    } else {
      setMsg({ text: "批量删除失败", ok: false });
    }
  }

  async function copyLink(url: string, id: number) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      setMsg({ text: "复制失败，请手动复制", ok: false });
    }
  }

  function toggleSelect(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function allSelected() {
    return items.length > 0 && selected.size === items.length;
  }
  function toggleSelectAll() {
    setSelected(allSelected() ? new Set() : new Set(items.map((m) => m.id)));
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Images size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">媒体库</h1>
      </div>

      {/* Upload zone */}
      <form
        onSubmit={upload}
        className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) {
              setFile(f);
              setAlt((a) => a || "");
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition ${
            dragOver
              ? "border-indigo-500 bg-indigo-500/5"
              : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <Upload size={26} className="text-zinc-400" />
          <p className="text-sm text-zinc-300">
            {file ? (
              <span className="font-medium text-indigo-300">{file.name}</span>
            ) : (
              "点击选择文件，或拖拽到此处上传"
            )}
          </p>
          <p className="text-xs text-zinc-500">支持图片、文档等任意类型</p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-sm text-zinc-300">备注（作为图片替代文本，留空默认使用上传文件名）</p>
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="图片描述，利于 SEO 与无障碍"
              className="w-64 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={uploading || !file}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? "上传中…" : "上传"}
          </button>
          {msg && (
            <span
              className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}
            >
              {msg.text}
            </span>
          )}
        </div>
      </form>

      {/* Toolbar */}
      <div className="mt-6 flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={allSelected()}
            onChange={toggleSelectAll}
            className="h-4 w-4 accent-indigo-500"
          />
          全选
        </label>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span>已选 {selected.size} / {items.length}</span>
          <button
            onClick={bulkDelete}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1 rounded-md border border-red-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950 disabled:opacity-40"
          >
            <Trash2 size={14} />
            批量删除
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <Images size={40} className="text-zinc-600" />
          <p className="text-sm text-zinc-400">还没有媒体文件。</p>
          <p className="text-xs text-zinc-500">使用上方上传区添加你的第一张图片或文档。</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => {
            const isSel = selected.has(m.id);
            const busy = busyIds.has(m.id);
            const isImage = m.mimeType.startsWith("image/");
            return (
              <div
                key={m.id}
                className={`group relative overflow-hidden rounded-lg border bg-zinc-900 transition ${
                  isSel ? "border-indigo-500 ring-1 ring-indigo-500" : "border-zinc-800"
                }`}
              >
                <label
                  className="absolute left-2 top-2 z-10 cursor-pointer rounded bg-black/50 p-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggleSelect(m.id)}
                    className="h-4 w-4 accent-indigo-500"
                  />
                </label>

                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.alt ?? m.filename}
                    loading="lazy"
                    className="h-32 w-full cursor-zoom-in object-cover"
                    onClick={() => setPreview(m)}
                  />
                ) : (
                  <div
                    className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 text-xs text-zinc-500"
                    onClick={() => setPreview(m)}
                  >
                    <FileIcon size={28} />
                    {m.mimeType}
                  </div>
                )}

                <div className="p-2">
                  <p className="truncate text-xs text-zinc-300" title={m.filename}>
                    {m.filename}
                  </p>
                  <p className="text-[11px] text-zinc-500">{formatSize(m.size)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPreview(m)}
                        title="查看 / 详情"
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-indigo-300"
                      >
                        <ZoomIn size={14} />
                      </button>
                      <button
                        onClick={() => copyLink(m.url, m.id)}
                        title="复制链接"
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-indigo-300"
                      >
                        {copiedId === m.id ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingId(m.id)}
                        title="编辑信息"
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-indigo-300"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => remove(m.id)}
                      disabled={busy}
                      title="删除"
                      className="inline-flex items-center gap-1 rounded p-1 text-red-400 hover:bg-red-950 disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingId !== null && (
        <EditModal
          item={items.find((m) => m.id === editingId) ?? null}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            setItems((list) => list.map((m) => (m.id === updated.id ? updated : m)));
            setEditingId(null);
            setMsg({ text: "已更新 ✓", ok: true });
          }}
          onError={(t) => setMsg({ text: t, ok: false })}
        />
      )}

      {preview && (
        <PreviewModal item={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function EditModal({
  item,
  onClose,
  onSaved,
  onError,
}: {
  item: MediaItem | null;
  onClose: () => void;
  onSaved: (m: MediaItem) => void;
  onError: (t: string) => void;
}) {
  const [filename, setFilename] = useState(item?.filename ?? "");
  const [alt, setAlt] = useState(item?.alt ?? "");
  const [saving, setSaving] = useState(false);

  if (!item) return null;

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/media/${item!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alt }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved(await res.json());
    } else {
      onError("保存失败");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-100">编辑媒体信息</h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <label className="block text-sm text-zinc-300">
            备注（作为图片替代文本 alt，利于 SEO 与无障碍）
            <textarea
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          <div className="text-xs text-zinc-500">
            实际文件名
            <div className="mt-1 break-all rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-zinc-400">
              {filename}
            </div>
          </div>
          {item.mimeType.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.alt ?? ""} className="max-h-40 rounded-md object-contain" />
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const isImage = item.mimeType.startsWith("image/");
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700"
      >
        <X size={20} />
      </button>
      <div
        className="flex max-h-[80vh] max-w-4xl flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.alt ?? ""}
            className="max-h-[70vh] rounded-lg object-contain"
          />
        ) : (
          <a
            href={item.url}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
          >
            <FileIcon size={18} />
            打开文件
          </a>
        )}
        <div className="rounded-lg bg-zinc-900/90 px-4 py-2 text-center text-xs text-zinc-300">
          <p className="font-medium text-zinc-100">{item.filename}</p>
          <p className="text-zinc-400">
            {item.mimeType} · {formatSize(item.size)}
            {item.alt ? ` · ${item.alt}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
