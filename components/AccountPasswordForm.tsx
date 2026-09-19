"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

/**
 * Change-password control. Renders only the fields + actions (no outer card),
 * so the hosting page decides the surrounding shell and it stays visually
 * consistent wherever it is placed (site settings, account page).
 * 纯第三方登录（nopassword）用户没有旧密码，自动切换为「直接设置新密码」。
 */
export default function AccountPasswordForm() {
  const [passwordless, setPasswordless] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account/oauth", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPasswordless(!!d?.passwordless))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    if (newPassword.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("密码已更新");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "修改失败");
    }
  }

  const inputCls =
    "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-500";

  return (
    <form onSubmit={submit} className="grid max-w-lg gap-4">
      <Msg tone="err" text={error} />
      <Msg tone="ok" text={msg} />

      {!passwordless && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">当前密码</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={inputCls}
          />
        </label>
      )}
      {passwordless && (
        <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          当前账号通过第三方登录创建，尚未设置独立密码。直接设置新密码后即可用邮箱/昵称登录。
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-zinc-400">
          新密码 <span className="text-zinc-600">（至少 8 位）</span>
        </span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-zinc-400">确认新密码</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-max items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        {passwordless ? "设置密码" : "更新密码"}
      </button>
    </form>
  );
}

function Msg({ tone, text }: { tone: "ok" | "err"; text: string }) {
  if (!text) return null;
  return (
    <p
      className={`rounded-md border px-3 py-2 text-xs ${
        tone === "ok"
          ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
          : "border-rose-800 bg-rose-950/40 text-rose-300"
      }`}
    >
      {text}
    </p>
  );
}