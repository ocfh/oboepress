"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileQuestion,
  Loader2,
  Save,
} from "lucide-react";

type NotFoundCfg = {
  title: string;
  message: string;
  showSearch: boolean;
  showRecent: boolean;
};

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="h-6 w-11 rounded-full bg-zinc-700 transition peer-checked:bg-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export default function NotFoundAdmin() {
  const [cfg, setCfg] = useState<NotFoundCfg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/not-found-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => setLoadError(true));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/not-found-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) {
      setCfg(await res.json());
      setMsg({ kind: "ok", text: "404 页面设置已保存" });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error ?? "保存失败" });
    }
  }

  if (loadError) {
    return <p className="text-sm text-rose-400">设置加载失败，请刷新重试。</p>;
  }
  if (!cfg) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileQuestion size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">404 页面</h1>
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">文案</h2>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-zinc-200">标题</label>
          <input
            className={inputCls}
            value={cfg.title}
            maxLength={120}
            onChange={(e) => setCfg({ ...cfg, title: e.target.value })}
          />
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-zinc-200">说明正文</label>
          <textarea
            className={`${inputCls} min-h-[96px] resize-y leading-6`}
            value={cfg.message}
            maxLength={500}
            onChange={(e) => setCfg({ ...cfg, message: e.target.value })}
          />
          <p className="mt-1 text-xs text-zinc-500">纯文本，按空行分段，最多 500 字。</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">模块开关</h2>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-200">显示搜索框</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                访客输入关键词后跳转站内搜索结果页。
              </p>
            </div>
            <Toggle
              checked={cfg.showSearch}
              onChange={(v) => setCfg({ ...cfg, showSearch: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-200">显示最近文章</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                列出最新 6 篇已发布文章，帮助访客继续浏览。
              </p>
            </div>
            <Toggle
              checked={cfg.showRecent}
              onChange={(v) => setCfg({ ...cfg, showRecent: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
