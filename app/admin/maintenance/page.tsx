"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Construction,
  Loader2,
  Save,
  TriangleAlert,
} from "lucide-react";

type MaintenanceCfg = {
  enabled: boolean;
  title: string;
  message: string;
};

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500";

export default function MaintenanceAdmin() {
  const [cfg, setCfg] = useState<MaintenanceCfg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/maintenance", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => setLoadError(true));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/maintenance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) {
      setCfg(await res.json());
      setMsg({ kind: "ok", text: "维护设置已保存并立即生效" });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error ?? "保存失败" });
    }
  }

  if (loadError) {
    return <p className="text-sm text-rose-400">维护设置加载失败，请刷新重试。</p>;
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
          <Construction size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">维护模式</h1>
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">关闭前台访问</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后，所有访客（含普通会员）打开前台任意内容页都会看到维护提示；
              管理员与编辑角色不受影响，可继续正常预览和管理站点。
            </p>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={cfg.enabled}
              onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            />
            <span className="h-6 w-11 rounded-full bg-zinc-700 transition peer-checked:bg-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          </label>
        </div>

        {cfg.enabled && (
          <div className="mt-5 flex items-start gap-2 rounded-md border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs leading-5 text-amber-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              维护期间伪装登录入口、会员注册与找回密码接口仍然可用；
              站点地图、Feed 等机器可读接口不受影响。
            </span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">维护页内容</h2>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-zinc-200">标题</label>
          <input
            className={inputCls}
            value={cfg.title}
            maxLength={120}
            onChange={(e) => setCfg({ ...cfg, title: e.target.value })}
            placeholder="网站维护中"
          />
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-zinc-200">
            说明正文
          </label>
          <textarea
            className={`${inputCls} min-h-[120px] resize-y leading-6`}
            value={cfg.message}
            maxLength={1000}
            onChange={(e) => setCfg({ ...cfg, message: e.target.value })}
            placeholder="站点正在进行例行维护，很快就会回来，请稍后再访问。"
          />
          <p className="mt-1 text-xs text-zinc-500">
            纯文本，按空行分段，最多 1000 字。
          </p>
        </div>
      </div>
    </div>
  );
}
