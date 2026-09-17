"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRound } from "lucide-react";

/**
 * 个人信息编辑框：修改昵称（name）与登录邮箱。保存成功后重签会话并
 * router.refresh()，让服务端渲染的侧边栏/页头即时显示新昵称。
 */
export default function AccountProfileForm({
  initialName,
  initialEmail,
}: {
  initialName: string;
  initialEmail: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setBusy(true);
    const res = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("个人信息已更新");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "保存失败");
    }
  }

  const inputCls =
    "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-500";

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error ? (
        <p className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
          {msg}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-zinc-400">昵称</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          autoComplete="name"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-zinc-400">邮箱</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={120}
          autoComplete="email"
          className={inputCls}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-max items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <UserRound size={16} />}
        保存修改
      </button>
    </form>
  );
}
