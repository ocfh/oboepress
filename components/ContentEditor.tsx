"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, FileDown, FileUp, Eye, ChevronDown, CircleCheck, MessageSquare, Hash, Tag, Search, Plus, Folder } from "lucide-react";
import BlockEditor from "@/components/BlockEditor";
import type { ThemeEditorField } from "@/themes/registry";
import {
  blocksToMarkdown,
  markdownToBlocks,
  type Block,
} from "@/lib/blocks";
import {
  getPostFormat,
  POST_FORMAT_OPTIONS,
} from "@/lib/post-formats";

type Option = { id: number; name: string };

/** ISO 时间 → datetime-local 控件需要的本地时区字符串。 */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export type EditorInitial = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: Block[];
  status: string;
  publishedAt?: string | null;
  featuredImage: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  commentStatus?: string;
  authorId?: number | null;
  parentId?: number | null;
  categoryIds?: number[];
  tagIds?: number[];
  metas?: { key: string; value: string }[];
  format?: string;
  formatMeta?: Record<string, string>;
  pinned?: boolean;
  template?: string | null;
};

export default function ContentEditor({
  kind,
  initial,
  categories,
  tags,
  authors,
  editorFields = {},
}: {
  kind: "post" | "page";
  initial?: EditorInitial;
  categories: Option[];
  tags: Option[];
  authors?: Option[];
  /** Theme-provided editor extension fields (keyed by a theme-local id). Only
   *  the active theme's fields are passed; when empty nothing is rendered. */
  editorFields?: Record<string, ThemeEditorField>;
}) {
  const router = useRouter();
  const isNew = !initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  // 定时发布：草稿 + 未来发布时间，到点由服务端懒翻转自动发布。
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(initial?.publishedAt));
  const [featuredImage, setFeaturedImage] = useState(initial?.featuredImage ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [seoKeywords, setSeoKeywords] = useState(initial?.seoKeywords ?? "");
  const [authorId, setAuthorId] = useState<number | "">(initial?.authorId ?? "");
  const [parentId, setParentId] = useState<number | "">(initial?.parentId ?? "");
  const [categoryIds, setCategoryIds] = useState<number[]>(initial?.categoryIds ?? []);
  const [tagIds, setTagIds] = useState<number[]>(initial?.tagIds ?? []);
  const [commentStatus, setCommentStatus] = useState<string>(initial?.commentStatus ?? "open");
  const [metas, setMetas] = useState<{ key: string; value: string }[]>(
    initial?.metas ?? [],
  );
  const [format, setFormat] = useState<string>(initial?.format ?? "standard");
  const [formatMeta, setFormatMeta] = useState<Record<string, string>>(
    initial?.formatMeta ?? {},
  );
  const [pinned, setPinned] = useState<boolean>(initial?.pinned ?? false);
  const [blocks, setBlocks] = useState<Block[]>(initial?.content ?? []);
  const [mdOpen, setMdOpen] = useState(false);
  const [mdText, setMdText] = useState("");
  const [mdMsg, setMdMsg] = useState("");

  // General helper: read/write a postMeta value by key (used by theme editor
  // extension fields — each theme owns its own key, so no theme is hard-coded).
  function metaValue(key: string): string | null {
    return metas.find((m) => m.key === key)?.value ?? null;
  }
  function setMetaValue(key: string, value: string | null) {
    setMetas((arr) => {
      const others = arr.filter((m) => m.key !== key);
      if (!value) return others;
      return [...others, { key, value }];
    });
  }

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const base = kind === "post" ? "posts" : "pages";

  function toggle(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  // 手动保存与草稿自动保存共用同一份请求体。
  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      title,
      slug: slug || undefined,
      excerpt: excerpt || undefined,
      content: blocks,
      status,
      publishedAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      featuredImage: featuredImage || undefined,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
      seoKeywords: seoKeywords || undefined,
      commentStatus,
      metas: metas.filter((m) => m.key.trim().length > 0),
    };
    if (kind === "post") {
      payload.categoryIds = categoryIds;
      payload.tagIds = tagIds;
      if (authorId !== "") payload.authorId = authorId;
      payload.format = format;
      payload.formatMeta = formatMeta;
      payload.pinned = pinned;
    } else {
      if (parentId !== "") payload.parentId = parentId;
    }
    return payload;
  }

  // --- 草稿自动保存：仅对已存在的草稿生效，防抖 2.5s 静默 PATCH -------------
  const [autoState, setAutoState] = useState<"idle" | "pending" | "saved" | "error">("idle");
  const [autoAt, setAutoAt] = useState("");
  // 已落库内容的快照，用于 dirty 判断；手动保存期间禁止自动保存抢占。
  const baselineRef = useRef("");
  const savingRef = useRef(false);
  const snapshot = () => JSON.stringify(buildPayload());

  async function autosave() {
    if (savingRef.current || isNew) return;
    try {
      const res = await fetch(`/api/${base}/${initial!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        setAutoState("error");
        return;
      }
      baselineRef.current = snapshot();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setAutoAt(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
      setAutoState("saved");
    } catch {
      setAutoState("error");
    }
  }

  useEffect(() => {
    // 新建文章尚无 id；已发布/归档内容不做静默写入，避免意外改动线上内容。
    if (isNew || status !== "draft") return;
    if (!baselineRef.current) {
      baselineRef.current = snapshot();
      return;
    }
    if (snapshot() === baselineRef.current) return;
    setAutoState("pending");
    const timer = setTimeout(() => {
      void autosave();
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title, slug, excerpt, blocks, status, scheduledAt, featuredImage,
    seoTitle, seoDescription, seoKeywords, commentStatus, authorId,
    parentId, categoryIds, tagIds, metas, format, formatMeta, pinned,
  ]);

  async function save() {
    setSaving(true);
    savingRef.current = true;
    setMsg("");
    const payload = buildPayload();

    const url = isNew ? `/api/${base}` : `/api/${base}/${initial!.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    savingRef.current = false;
    if (res.ok) {
      setMsg("已保存 ✓");
      if (!isNew) baselineRef.current = snapshot();
      if (isNew) {
        router.push(`/admin/${base}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "保存失败");
    }
  }

  function importMarkdown() {
    setMdMsg("");
    try {
      const parsed = markdownToBlocks(mdText);
      if (parsed.length === 0) {
        setMdMsg("未解析出任何内容，请检查 Markdown 语法。");
        return;
      }
      setBlocks(parsed);
      setMdOpen(false);
      setMdText("");
      setMdMsg(`已导入 ${parsed.length} 个区块 ✓`);
    } catch {
      setMdMsg("Markdown 解析失败，请检查格式。");
    }
  }

  function exportMarkdown() {
    const md = blocksToMarkdown(blocks);
    // Download as .md file
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base =
      (title || (initial?.slug ?? "") || kind === "post" ? "post" : "page")
        .toLowerCase()
        .replace(/\s+/g, "-") || "content";
    a.href = url;
    a.download = `${base}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {isNew ? `新建${kind === "post" ? "文章" : "页面"}` : `编辑`}
        </h1>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-emerald-400">{msg}</span>}
          {mdMsg && <span className="text-sm text-emerald-400">{mdMsg}</span>}
          {!isNew && status === "draft" && autoState === "pending" && (
            <span className="text-xs text-zinc-500">自动保存中…</span>
          )}
          {!isNew && status === "draft" && autoState === "saved" && (
            <span className="text-xs text-zinc-500">已自动保存 {autoAt}</span>
          )}
          {!isNew && status === "draft" && autoState === "error" && (
            <span className="text-xs text-rose-400">自动保存失败</span>
          )}
          <button
            type="button"
            onClick={() => {
              setMdText(blocksToMarkdown(blocks));
              setMdOpen((v) => !v);
              setMdMsg("");
            }}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-indigo-500 hover:text-white"
          >
            {mdOpen ? <ChevronDown size={16} /> : <Eye size={16} />}
            {mdOpen ? "关闭 MD" : "Markdown"}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {mdOpen && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <FileDown size={16} className="text-zinc-500" />
            Markdown 导入 / 导出（兼容 GitHub / Obsidian 等）
          </p>
          <textarea
            value={mdText}
            onChange={(e) => setMdText(e.target.value)}
            rows={12}
            placeholder={"在此粘贴 Markdown 文本，然后点「导入为区块」；或点「导出 .md」下载当前内容。"}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={importMarkdown}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              <FileUp size={16} />
              导入为区块
            </button>
            <button
              type="button"
              onClick={exportMarkdown}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-indigo-500 hover:text-white"
            >
              <FileDown size={16} />
              导出 .md
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-lg outline-none focus:border-indigo-500"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="URL 别名（留空自动生成）"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="摘要（留空自动从正文生成）"
            rows={2}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <BlockEditor value={blocks} onChange={setBlocks} />
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <CircleCheck size={15} className="text-zinc-500" />
              状态
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
            >
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="archived">已归档</option>
            </select>

            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <FileUp size={15} className="text-zinc-500" />
              发布时间
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm [color-scheme:dark]"
            />
            <p className="mt-1 text-xs text-zinc-500">
              草稿状态下设为未来时间即定时发布，到点自动上线；留空则按保存时间。
            </p>

            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <MessageSquare size={15} className="text-zinc-500" />
              评论
            </label>
            <select
              value={commentStatus}
              onChange={(e) => setCommentStatus(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
            >
              <option value="open">开放评论</option>
              <option value="closed">关闭评论</option>
            </select>

            {kind === "post" && authors && authors.length > 0 && (
              <>
                <label className="mt-3 block text-sm text-zinc-300">作者</label>
                <select
                  value={authorId}
                  onChange={(e) =>
                    setAuthorId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
                >
                  <option value="">（默认自己）</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {kind === "page" && (
              <>
                <label className="mt-3 block text-sm text-zinc-300">父页面</label>
                <input
                  type="number"
                  value={parentId}
                  onChange={(e) =>
                    setParentId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="父页面 ID（可选）"
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
                />
              </>
            )}

            <label className="mt-3 block text-sm text-zinc-300">特色图 URL</label>
            <input
              value={featuredImage}
              onChange={(e) => setFeaturedImage(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500"
            />

            {Object.entries(editorFields)
              // 字段按 target 决定出现在文章编辑器还是页面编辑器（默认仅文章）
              .filter(([, field]) => {
                const t = field.target ?? "post";
                return t === "both" || t === kind;
              })
              .map(([key, field]) => {
                const Mod = field.Component;
                return (
                  <div className="mt-3" key={key}>
                    <Mod
                      value={metaValue(field.metaKey)}
                      onChange={(v) => setMetaValue(field.metaKey, v)}
                      featuredImage={featuredImage || undefined}
                    />
                  </div>
                );
              })}

            {kind === "post" && (
              <>
                <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                  <CircleCheck size={15} className="text-zinc-500" />
                  文章形式
                </label>
                <select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value);
                    setFormatMeta({});
                  }}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
                >
                  {POST_FORMAT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {getPostFormat(format).description}
                </p>

                {getPostFormat(format).extraFields?.map((field) => (
                  <div key={field.key} className="mt-2">
                    <label className="block text-xs text-zinc-400">{field.label}</label>
                    {field.type === "textarea" ? (
                      <textarea
                        value={formatMeta[field.key] ?? ""}
                        onChange={(e) =>
                          setFormatMeta((m) => ({ ...m, [field.key]: e.target.value }))
                        }
                        rows={2}
                        placeholder={field.placeholder}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                    ) : (
                      <input
                        type={field.type === "url" ? "url" : "text"}
                        value={formatMeta[field.key] ?? ""}
                        onChange={(e) =>
                          setFormatMeta((m) => ({ ...m, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                ))}

                <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                  />
                  置顶（固定在列表顶部）
                </label>
              </>
            )}
          </div>

          {kind === "post" && (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <Folder size={15} className="text-zinc-500" />
                  分类
                </p>
                <div className="space-y-1">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={categoryIds.includes(c.id)}
                        onChange={() => setCategoryIds(toggle(categoryIds, c.id))}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <Tag size={15} className="text-zinc-500" />
                  标签
                </p>
                <div className="space-y-1">
                  {tags.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tagIds.includes(t.id)}
                        onChange={() => setTagIds(toggle(tagIds, t.id))}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Search size={15} className="text-zinc-500" />
              SEO
            </p>
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="SEO 标题"
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder="SEO 描述"
              rows={2}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <input
              value={seoKeywords}
              onChange={(e) => setSeoKeywords(e.target.value)}
              placeholder="SEO 关键词，逗号分隔"
              className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Hash size={15} className="text-zinc-500" />
              自定义字段
            </p>
            <div className="space-y-2">
              {metas.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={m.key}
                    onChange={(e) =>
                      setMetas((arr) => arr.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                    }
                    placeholder="键"
                    className="w-1/3 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                  />
                  <input
                    value={m.value}
                    onChange={(e) =>
                      setMetas((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                    placeholder="值"
                    className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setMetas((arr) => arr.filter((_, j) => j !== i))}
                    className="rounded bg-zinc-800 px-2 text-xs text-red-300"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMetas((arr) => [...arr, { key: "", value: "" }])}
              className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline"
            >
              <Plus size={13} />
              添加字段
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
