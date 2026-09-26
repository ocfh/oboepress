"use client";

/**
 * 阅读时长设置面板。保存即 PATCH 插件设置；启用插件后 bluemix 文章页头图
 * meta 区会自动出现「约 N 分钟」（主题消费 post.meta 钩子）。
 */
import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Clock } from "lucide-react";

const SLUG = "reading-time";

type S = { cpm: number; wpm: number; template: string; showWordCount: boolean; hookMeta: boolean };
const DEFAULTS: S = { cpm: 400, wpm: 220, template: "约 {minutes} 分钟", showWordCount: false, hookMeta: true };

export default function ReadingTimeAdmin() {
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
        <Clock size={15} className="text-indigo-400" />
        阅读时长显示在文章页头图 meta 区（点赞 / 评论 / 浏览量 / 日期 同行）。
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={s.hookMeta !== false} onChange={(e) => setS({ ...s, hookMeta: e.target.checked })} />
        直接注入主题文章页 meta 区（关闭后不显示）
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-zinc-300">
          中文阅读速度（字/分钟）
          <input type="number" min={1} value={s.cpm} onChange={(e) => setS({ ...s, cpm: Number(e.target.value) })}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
        </label>
        <label className="block text-sm text-zinc-300">
          外文阅读速度（词/分钟）
          <input type="number" min={1} value={s.wpm} onChange={(e) => setS({ ...s, wpm: Number(e.target.value) })}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
        </label>
      </div>

      <label className="block text-sm text-zinc-300">
        显示模板（可用 {"{minutes} {words} {chars}"}）
        <input value={s.template} onChange={(e) => setS({ ...s, template: e.target.value })}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={!!s.showWordCount} onChange={(e) => setS({ ...s, showWordCount: e.target.checked })} />
        同时显示全文字数
      </label>

      <button onClick={save} disabled={saving}
        className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50">
        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
        {saving ? "保存中…" : saved ? "已保存" : "保存设置"}
      </button>
    </div>
  );
}
