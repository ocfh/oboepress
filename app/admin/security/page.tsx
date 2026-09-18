"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

type CaptchaMode = "builtin" | "custom";

type SecurityCfg = {
  entryEnabled: boolean;
  entryPath: string;
  captchaEnabled: boolean;
  captchaMode: CaptchaMode;
  captchaVerifyUrl: string;
};

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500";

export default function SecurityAdmin() {
  const [cfg, setCfg] = useState<SecurityCfg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/security", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => setLoadError(true));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/security", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) {
      setCfg(await res.json());
      setMsg({ kind: "ok", text: "安全设置已保存并立即生效，请确认已收藏新的登录入口地址" });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error ?? "保存失败" });
    }
  }

  if (loadError) {
    return <p className="text-sm text-rose-400">安全设置加载失败，请刷新重试。</p>;
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
          <ShieldCheck size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">后台安全</h1>
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
            <h2 className="text-sm font-semibold text-zinc-100">伪装后台入口</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后，未登录访客访问 <code className="text-zinc-300">/admin</code>、
              <code className="text-zinc-300">/admin/login</code> 一律返回 404，
              登录只能通过下方的秘密入口地址进行；直接调用登录接口同样会被拒绝。
            </p>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={cfg.entryEnabled}
              onChange={(e) => setCfg({ ...cfg, entryEnabled: e.target.checked })}
            />
            <span className="h-6 w-11 rounded-full bg-zinc-700 transition peer-checked:bg-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          </label>
        </div>

        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-zinc-200">
            秘密登录入口路径
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">/</span>
            <input
              className={inputCls}
              value={cfg.entryPath.replace(/^\//, "")}
              onChange={(e) =>
                setCfg({ ...cfg, entryPath: "/" + e.target.value.replace(/^\/+/, "") })
              }
              placeholder="secret-login"
              spellCheck={false}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            仅允许小写字母、数字、-、_，可用 / 分层（最多 3 层），总长度 ≤ 64；
            不可占用 /admin、/api、/search 等保留路径，也不能与固定链接前缀冲突。
          </p>
          {origin && (
            <p className="mt-2 break-all rounded-md bg-zinc-950 px-3 py-2 font-mono text-xs text-indigo-300">
              {origin}
              {cfg.entryPath || "/secret-login"}
            </p>
          )}
        </div>

        {cfg.entryEnabled && (
          <div className="mt-5 flex items-start gap-2 rounded-md border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs leading-5 text-amber-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              保存后请立刻收藏或记录上方完整入口地址。若与已发布文章 / 页面地址相同，
              内容页面优先，入口将无法打开，请另选路径。
            </span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">登录验证码</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后，登录后台必须先通过验证码校验，验证码先于账号密码验证，
              可降低密码被暴力探测的风险。
            </p>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={cfg.captchaEnabled}
              onChange={(e) => setCfg({ ...cfg, captchaEnabled: e.target.checked })}
            />
            <span className="h-6 w-11 rounded-full bg-zinc-700 transition peer-checked:bg-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          </label>
        </div>

        {cfg.captchaEnabled && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-200">
                验证码方式
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { v: "builtin", t: "内置图形验证码", d: "系统生成 4 位字符图片" },
                    { v: "custom", t: "自定义校验接口", d: "对接自建 / 第三方验证码" },
                  ] as { v: CaptchaMode; t: string; d: string }[]
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setCfg({ ...cfg, captchaMode: opt.v })}
                    className={`rounded-md border px-3 py-2 text-left transition ${
                      cfg.captchaMode === opt.v
                        ? "border-indigo-500 bg-indigo-950/40"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    <span className="block text-xs font-medium text-zinc-100">{opt.t}</span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">{opt.d}</span>
                  </button>
                ))}
              </div>
            </div>

            {cfg.captchaMode === "custom" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-200">
                  验证码校验接口地址
                </label>
                <input
                  className={inputCls}
                  value={cfg.captchaVerifyUrl}
                  onChange={(e) => setCfg({ ...cfg, captchaVerifyUrl: e.target.value })}
                  placeholder="https://example.com/api/verify-captcha"
                  spellCheck={false}
                />
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  登录时系统会以 POST 发送 <code className="text-zinc-300">{"{ token }"}</code>
                  到该地址（8 秒超时），返回 HTTP 200 且响应体为
                  <code className="text-zinc-300">{"{ ok: true }"}</code> 或
                  <code className="text-zinc-300">{"{ success: true }"}</code>
                  才视为通过；接口不可用时登录将被暂时拒绝。
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
