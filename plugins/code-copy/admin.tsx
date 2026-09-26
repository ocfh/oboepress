"use client";

/** 代码块一键复制：按钮文案 / 语言标签 / 行号设置。 */
import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Copy } from "lucide-react";

const SLUG = "code-copy";

type S = { buttonText: string; copiedText: string; showLang: boolean; showLineNumbers: boolean };
const DEFAULTS: S = { buttonText: "复制", copiedText: "已复制", showLang: true, showLineNumbers: false };

export default function CodeCopyAdmin() {
  const [s, setS] = useState<S>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/plugins", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = j.data ?? j;
        const me = (Array.isArray(list) ? list : list.items ?? []).find((p: { slug: string }) => p.slug === SLUG);
        setS({ ...DEFAULTS, ...(me?.settings ?? {}) });
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/plugins/${SLUG}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: s }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" /> 加载中…</p>;

  return (
    <div className="max-w-xl space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="flex items-center gap-2 text-sm text-zinc-400">
        <Copy size={15} className="text-indigo-400" />
        为前台所有代码块右上角添加复制按钮（鼠标悬停时显现），客户端导航后自动生效。
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-zinc-300">
          按钮文案
          <input value={s.buttonText} onChange={(e) => setS({ ...s, buttonText: e.target.value })}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
        </label>
        <label className="block text-sm text-zinc-300">
          复制成功文案
          <input value={s.copiedText} onChange={(e) => setS({ ...s, copiedText: e.target.value })}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={!!s.showLang} onChange={(e) => setS({ ...s, showLang: e.target.checked })} />
        显示代码语言标签
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={!!s.showLineNumbers} onChange={(e) => setS({ ...s, showLineNumbers: e.target.checked })} />
        显示行号
      </label>

      <button onClick={save} disabled={saving}
        className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50">
        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
        {saving ? "保存中…" : saved ? "已保存" : "保存设置"}
      </button>
    </div>
  );
}
