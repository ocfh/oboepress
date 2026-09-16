"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export default function AccountPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    if (newPassword !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.ok) {
      setMsg("密码已更新 ✓");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "修改失败");
    }
  }

  const inputCls =
    "rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500";

  return (
    <form onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-indigo-400" />
        <h3 className="text-base font-semibold text-zinc-100">修改密码</h3>
      </div>
      <div className="mt-4 grid max-w-md gap-4">
        <div>
          <p className="mb-1 text-sm text-zinc-300">当前密码</p>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-zinc-300">新密码（至少 8 位）</p>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className={inputCls}
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-zinc-300">确认新密码</p>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className={inputCls}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {msg && <p className="text-sm text-emerald-400">{msg}</p>}
        <button
          type="submit"
          className="inline-flex w-max items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <KeyRound size={16} />
          更新密码
        </button>
      </div>
    </form>
  );
}