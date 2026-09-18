"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  Save,
} from "lucide-react";

type PostMode = "slug" | "id" | "pinyin" | "initial" | "custom";

type Cfg = {
  postMode: PostMode;
  postPattern: string;
  postBase: string;
  pageBase: string;
  categoryBase: string;
  tagBase: string;
};

const MODES: { value: PostMode; label: string; hint: string }[] = [
  { value: "slug", label: "存储别名", hint: "作者为每篇文章设定的唯一别名（默认）" },
  { value: "id", label: "文章 ID", hint: "纯数字，最稳定，与标题无关" },
  { value: "pinyin", label: "标题全拼", hint: "如「你好」→ ni-hao" },
  { value: "initial", label: "拼音首字母", hint: "如「你好世界」→ nhsj" },
  { value: "custom", label: "自定义结构", hint: "用 token 组合，可含日期目录" },
];

const TOKEN_HELP =
  "可用 token：{id} {slug} {pinyin} {initial} {year} {month} {day}，可用 / 分层。例：{year}/{month}/{slug}";

const TOKENS: Record<string, string> = {
  "{id}": "123",
  "{slug}": "hello-world",
  "{pinyin}": "ni-hao-shi-jie",
  "{initial}": "nhsj",
  "{year}": "2026",
  "{month}": "09",
  "{day}": "18",
};

/** 镜像服务端 joinPath：去首尾斜杠后拼接，空前缀即根级。 */
function join(base: string, tail = ""): string {
  const b = base.trim().replace(/^\/+|\/+$/g, "");
  const segs = [b, tail].filter(Boolean).join("/");
  return segs ? "/" + segs : "/";
}

function tailPreview(cfg: Cfg): string {
  switch (cfg.postMode) {
    case "id":
      return "123";
    case "pinyin":
      return "ni-hao-shi-jie";
    case "initial":
      return "nhsj";
    case "custom": {
      const segs = cfg.postPattern
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .map((s) => s.replace(/\{(id|slug|pinyin|initial|year|month|day)\}/g, (k) => TOKENS[k] ?? ""))
        .filter(Boolean);
      return segs.join("/") || "hello-world";
    }
    default:
      return "hello-world";
  }
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500";

function BaseField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-200">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">/</span>
        <input className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
      <span className="mt-1 block text-xs text-zinc-500">{hint}</span>
    </label>
  );
}

export default function PermalinksAdmin() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/permalinks", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => setLoadError(true));
  }, []);

  function patch(p: Partial<Cfg>) {
    setCfg((c) => (c ? { ...c, ...p } : c));
    setMsg(null);
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/permalinks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) {
      setCfg(await res.json());
      setMsg({ kind: "ok", text: "固定链接已保存，全站链接立即生效" });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error ?? "保存失败" });
    }
  }

  if (loadError) {
    return <p className="text-sm text-rose-400">固定链接设置加载失败，请刷新重试。</p>;
  }
  if (!cfg) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载…
      </div>
    );
  }

  const tail = tailPreview(cfg);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">固定链接</h1>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "保存中…" : "保存更改"}
        </button>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
            msg.kind === "ok"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-rose-800 bg-rose-950/40 text-rose-300"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {/* 实时预览 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">链接预览</h2>
        <ul className="space-y-2 font-mono text-xs text-zinc-300">
          <li className="flex justify-between gap-3">
            <span className="text-zinc-500">文章列表页</span>
            <span>{join(cfg.postBase)}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-zinc-500">文章示例</span>
            <span>{join(cfg.postBase, tail)}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-zinc-500">独立页面</span>
            <span>{join(cfg.pageBase, "about")}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-zinc-500">分类</span>
            <span>{join(cfg.categoryBase, "notes")}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-zinc-500">标签</span>
            <span>{join(cfg.tagBase, "life")}</span>
          </li>
        </ul>
      </div>

      {/* 文章链接形式 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-100">文章链接形式</h2>
        <p className="mb-4 text-xs text-zinc-500">
          决定文章地址中「前缀之后」的部分。切换到全拼 / 首字母时，历史文章会自动回填，无需手动处理。
        </p>
        <div className="space-y-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 px-3 py-2 text-sm hover:border-zinc-700"
            >
              <input
                type="radio"
                name="postMode"
                className="mt-1"
                checked={cfg.postMode === m.value}
                onChange={() => patch({ postMode: m.value })}
              />
              <span>
                <span className="font-medium text-zinc-200">{m.label}</span>
                <span className="ml-2 text-xs text-zinc-500">{m.hint}</span>
                <span className="ml-2 font-mono text-xs text-indigo-300">
                  {join(cfg.postBase, tailPreview({ ...cfg, postMode: m.value }))}
                </span>
              </span>
            </label>
          ))}
        </div>

        {cfg.postMode === "custom" && (
          <div className="mt-4">
            <BaseField
              label="自定义结构"
              hint={TOKEN_HELP}
              value={cfg.postPattern}
              onChange={(v) => patch({ postPattern: v })}
              placeholder="{slug}"
            />
          </div>
        )}
      </div>

      {/* 路径前缀 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-100">路径前缀</h2>
        <p className="mb-4 text-xs text-zinc-500">
          前缀可以改名，也可以整体留空（对应内容放到站点根级）。留空时若不同类型内容使用了相同别名，解析顺序为
          文章 → 页面 → 分类 → 标签。
        </p>
        <div className="space-y-4">
          <BaseField
            label="文章前缀"
            hint="默认 blog；文章列表页就在此前缀。"
            value={cfg.postBase}
            onChange={(v) => patch({ postBase: v })}
            placeholder="blog"
          />
          <BaseField
            label="独立页面前缀"
            hint="默认 pages；留空后页面地址如 /about。"
            value={cfg.pageBase}
            onChange={(v) => patch({ pageBase: v })}
            placeholder="pages"
          />
          <BaseField
            label="分类前缀"
            hint="默认 blog/category。"
            value={cfg.categoryBase}
            onChange={(v) => patch({ categoryBase: v })}
            placeholder="blog/category"
          />
          <BaseField
            label="标签前缀"
            hint="默认 blog/tag。"
            value={cfg.tagBase}
            onChange={(v) => patch({ tagBase: v })}
            placeholder="blog/tag"
          />
        </div>
      </div>
    </div>
  );
}
