"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    const res = await fetch("/api/auth/logout", { method: "POST" });
    const data = await res.json().catch(() => null);
    // 伪装开启时 /admin/login 已 404，登出后回到秘密入口。
    router.push(data?.entryEnabled ? data.entryPath : "/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:opacity-50"
    >
      <LogOut size={16} />
      {loading ? "退出中…" : "退出登录"}
    </button>
  );
}
