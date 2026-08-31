"use client";

import { nanoid } from "nanoid";
import {
  Heading,
  Pilcrow,
  Image as ImageIcon,
  Quote,
  Code,
  List,
  Minus,
  Braces,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { BLOCK_TYPES, serializeBlocks, type Block } from "@/lib/blocks";

const TYPE_ICON: Record<string, LucideIcon> = {
  heading: Heading,
  paragraph: Pilcrow,
  image: ImageIcon,
  quote: Quote,
  code: Code,
  list: List,
  divider: Minus,
  html: Braces,
};

export default function BlockEditor({
  value,
  onChange,
}: {
  value: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  function update(id: string, patch: Partial<Block>) {
    onChange(
      value.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    );
  }

  function remove(id: string) {
    onChange(value.filter((b) => b.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    const idx = value.findIndex((b) => b.id === id);
    const next = [...value];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function add(type: Block["type"]) {
    const block = createBlock(type);
    onChange([...value, block]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <span className="mr-1 self-center text-xs text-zinc-500">添加区块：</span>
        {BLOCK_TYPES.map((t) => {
          const Icon = TYPE_ICON[t.type];
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => add(t.type)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-indigo-500 hover:text-white"
            >
              {Icon ? <Icon size={14} /> : <Plus size={14} />}
              {t.label}
            </button>
          );
        })}
      </div>

      {value.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
          暂无内容，使用上面的按钮添加区块。
        </p>
      )}

      {value.map((block, i) => (
        <BlockCard
          key={block.id}
          block={block}
          index={i}
          total={value.length}
          onUpdate={(patch) => update(block.id, patch)}
          onRemove={() => remove(block.id)}
          onMove={(dir) => move(block.id, dir)}
        />
      ))}

      {value.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 text-xs font-medium text-zinc-500">实时预览</p>
          <div
            className="prose-cms"
            dangerouslySetInnerHTML={{ __html: serializeBlocks(value) }}
          />
        </div>
      )}
    </div>
  );
}

function createBlock(type: Block["type"]): Block {
  const id = nanoid();
  switch (type) {
    case "heading":
      return { id, type: "heading", level: 2, text: "" };
    case "paragraph":
      return { id, type: "paragraph", text: "" };
    case "image":
      return { id, type: "image", url: "", alt: "", caption: "" };
    case "quote":
      return { id, type: "quote", text: "", cite: "" };
    case "code":
      return { id, type: "code", language: "ts", code: "" };
    case "list":
      return { id, type: "list", ordered: false, items: [""] };
    case "divider":
      return { id, type: "divider" };
    case "html":
      return { id, type: "html", html: "" };
  }
}

function BlockCard({
  block,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  block: Block;
  index: number;
  total: number;
  onUpdate: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const label = BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? "";
  const Icon = TYPE_ICON[block.type];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-400">
          {Icon ? <Icon size={14} /> : null}
          {label}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="上移"
            className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="下移"
            className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="删除"
            className="rounded border border-red-900 p-1.5 text-red-400 hover:bg-red-950"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <BlockFields block={block} onUpdate={onUpdate} />
    </div>
  );
}

function BlockFields({
  block,
  onUpdate,
}: {
  block: Block;
  onUpdate: (patch: Partial<Block>) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <select
            value={block.level}
            onChange={(e) =>
              onUpdate({ level: Number(e.target.value) as 1 | 2 | 3 | 4 })
            }
            className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
          </select>
          <input
            value={block.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder="标题文本"
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
      );
    case "paragraph":
      return (
        <textarea
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={4}
          placeholder="段落内容"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
      );
    case "image":
      return (
        <div className="space-y-2">
          <input
            value={block.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder="图片 URL"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <input
              value={block.alt}
              onChange={(e) => onUpdate({ alt: e.target.value })}
              placeholder="替代文本 alt"
              className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <input
              value={block.caption ?? ""}
              onChange={(e) => onUpdate({ caption: e.target.value })}
              placeholder="图注（可选）"
              className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      );
    case "quote":
      return (
        <div className="space-y-2">
          <textarea
            value={block.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            rows={3}
            placeholder="引用内容"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <input
            value={block.cite ?? ""}
            onChange={(e) => onUpdate({ cite: e.target.value })}
            placeholder="出处（可选）"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
      );
    case "code":
      return (
        <div className="space-y-2">
          <input
            value={block.language ?? ""}
            onChange={(e) => onUpdate({ language: e.target.value })}
            placeholder="语言（如 ts, js, python）"
            className="w-48 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <textarea
            value={block.code}
            onChange={(e) => onUpdate({ code: e.target.value })}
            rows={6}
            placeholder="代码"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
          />
        </div>
      );
    case "list":
      return (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={block.ordered}
              onChange={(e) => onUpdate({ ordered: e.target.checked })}
            />
            有序列表
          </label>
          <textarea
            value={block.items.join("\n")}
            onChange={(e) =>
              onUpdate({
                items: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
              })
            }
            rows={4}
            placeholder="每行一个条目"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
      );
    case "divider":
      return (
        <p className="text-sm text-zinc-500">一条水平分割线。</p>
      );
    case "html":
      return (
        <div className="space-y-2">
          <p className="text-xs text-amber-400">
            原始 HTML（受信任内容，将按原样输出，不会被转义）。
          </p>
          <textarea
            value={block.html}
            onChange={(e) => onUpdate({ html: e.target.value })}
            rows={6}
            placeholder={"<div class=\"callout\">自定义 HTML…</div>"}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
          />
        </div>
      );
  }
}
