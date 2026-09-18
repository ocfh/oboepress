"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, User, Lock, ShieldCheck, ArrowLeft } from "lucide-react";

/**
 * 后台登录表单的唯一实现，同时渲染在 /admin/login（默认模式）与伪装后的
 * 秘密入口路径（catch-all 直接渲染本组件，URL 保持秘密路径不变）。
 */
export default function AdminLogin() {
  const router = useRouter();
  // 账号支持邮箱或昵称（登录接口按是否含 @ 分流查询，均不区分大小写）。
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // null = 配置尚未加载；加载后按 enabled/mode 决定是否显示验证码区。
  const [captchaCfg, setCaptchaCfg] = useState<{
    enabled: boolean;
    mode: "builtin" | "custom";
  } | null>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [imgNonce, setImgNonce] = useState(0);

  const refreshCaptcha = () => {
    setCaptchaCode("");
    setImgNonce(Date.now());
  };

  // First run (no accounts yet) → go to the setup wizard instead.
  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d?.setupRequired) router.replace("/admin/setup");
      })
      .catch(() => {});
    // 是否需要验证码（含伪装开启时的 Referer 门控，失败按关闭处理）。
    fetch("/api/captcha", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        if (d?.enabled && (d.mode === "builtin" || d.mode === "custom")) {
          setCaptchaCfg({ enabled: true, mode: d.mode });
          setImgNonce(Date.now());
        } else {
          setCaptchaCfg({ enabled: false, mode: "builtin" });
        }
      })
      .catch(() => setCaptchaCfg({ enabled: false, mode: "builtin" }));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account,
        password,
        ...(captchaCfg?.enabled ? { captcha: captchaCode } : {}),
      }),
    });
    if (res.ok) {
      const from =
        new URLSearchParams(window.location.search).get("from") || "/admin";
      router.push(from);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      // 伪装开启时非入口页调用会得到 404，提示与 401 区分开。
      setError(data.error || "登录失败");
      setLoading(false);
      // 图形码一次失败即换图，避免拿着旧答案反复试。
      if (captchaCfg?.mode === "builtin") refreshCaptcha();
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
          <User size={15} className="text-zinc-500" />
          邮箱或昵称
        </label>
        <input
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          autoComplete="username"
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

        {captchaCfg?.enabled && (
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <ShieldCheck size={15} className="text-zinc-500" />
              验证码
            </label>
            {captchaCfg.mode === "builtin" ? (
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  maxLength={4}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-indigo-500"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/captcha/image?t=${imgNonce}`}
                  alt="验证码"
                  title="看不清？点击刷新"
                  onClick={refreshCaptcha}
                  className="h-[38px] w-[120px] shrink-0 cursor-pointer rounded-md border border-zinc-700"
                />
              </div>
            ) : (
              <>
                <input
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  maxLength={200}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="第三方验证码凭证"
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  由站点配置的第三方验证码服务校验。
                </p>
              </>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "登录中…" : "登录"}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          可用邮箱或昵称登录 · 演示账号 admin@cms.local / admin12345
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
