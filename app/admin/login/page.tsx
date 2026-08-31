"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Mail, Lock, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // First run (no accounts yet) → go to the setup wizard instead.
  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d?.setupRequired) router.replace("/admin/setup");
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const from =
        new URLSearchParams(window.location.search).get("from") || "/admin";
      router.push(from);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "登录失败");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <LayoutDashboard size={24} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">OboePress</h1>
            <p className="text-sm text-zinc-400">登录管理后台</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <Mail size={15} className="text-zinc-500" />
          邮箱
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          required
        />

        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <Lock size={15} className="text-zinc-500" />
          密码
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          required
        />

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "登录中…" : "登录"}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          演示账号 admin@cms.local / admin12345
        </p>
        <p className="mt-2 text-center text-xs">
          <Link href="/" className="inline-flex items-center gap-1 text-indigo-400 hover:underline">
            <ArrowLeft size={13} />
            返回站点首页
          </Link>
        </p>
      </form>
    </div>
  );
}
