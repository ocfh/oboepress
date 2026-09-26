"use client";

/** 图片灯箱：点击正文图片全屏查看；可配说明文字与最小触发尺寸。 */
import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Image } from "lucide-react";

const SLUG = "image-lightbox";

type S = { caption: boolean; minSize: number };
const DEFAULTS: S = { caption: true, minSize: 0 };

export default function ImageLightboxAdmin() {
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
        <Image size={15} className="text-indigo-400" />
        启用后，点击文章/页面正文里的图片会全屏放大；Esc 或点击遮罩关闭。
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={!!s.caption} onChange={(e) => setS({ ...s, caption: e.target.checked })} />
        灯箱底部显示图片说明（取替代文本/备注）
      </label>

      <label className="block text-sm text-zinc-300">
        最小触发宽度（像素，0 = 不限制；可避开小图标/表情）
        <input type="number" min={0} value={s.minSize} onChange={(e) => setS({ ...s, minSize: Math.max(0, Number(e.target.value)) })}
          className="mt-1 w-40 rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm outline-none focus:border-indigo-500" />
      </label>

      <button onClick={save} disabled={saving}
        className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50">
        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
        {saving ? "保存中…" : saved ? "已保存" : "保存设置"}
      </button>
    </div>
  );
}
