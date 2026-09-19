"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  User,
  Lock,
  ShieldCheck,
  ArrowLeft,
  KeyRound,
  Mail,
  Smartphone,
} from "lucide-react";
import OAuthButtons from "@/components/shared/OAuthButtons";
import type { PublicProvider } from "@/lib/services/oauth";

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
  // 两步验证第二阶段：密码通过后服务端返回短时票据，改输动态码/恢复码。
  const [twoFa, setTwoFa] = useState<{ ticket: string; type: string } | null>(
    null,
  );
  const [twoFaCode, setTwoFaCode] = useState("");
  // 已启用且配置完整的第三方登录提供商（公开端点，不含密钥）。
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  // 找回密码模式：第一步发码，第二步凭码重置。
  const [mode, setMode] = useState<"login" | "forgot" | "codelogin">("login");
  const [resetSent, setResetSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetPwd, setResetPwd] = useState("");
  const [okMsg, setOkMsg] = useState("");
  // 验证码免密登录：可用通道由 /api/auth/login-config 按通知设置下发。
  const [loginChannels, setLoginChannels] = useState<{
    email: boolean;
    sms: boolean;
  } | null>(null);
  const [codeChannel, setCodeChannel] = useState<"email" | "sms">("email");
  const [codeTarget, setCodeTarget] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCd, setCodeCd] = useState(0);
  const [sendCodeErr, setSendCodeErr] = useState("");

  const refreshCaptcha = () => {
    setCaptchaCode("");
    setImgNonce(Date.now());
  };

  // First run (no accounts yet) → go to the setup wizard instead.
  useEffect(() => {
    // OAuth 回调失败时带 oauth_error 回到登录页，直接展示原因。
    const oauthErr = new URLSearchParams(window.location.search).get(
      "oauth_error",
    );
    if (oauthErr) setError(oauthErr);
    fetch("/api/oauth/providers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProviders(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d?.setupRequired) router.replace("/admin/setup");
      })
      .catch(() => {});
    // 验证码登录通道（伪装开启时带秘密入口 Referer 才返回，失败按全关处理）。
    fetch("/api/auth/login-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { email: false, sms: false }))
      .then((d) => {
        const ch = { email: !!d?.email, sms: !!d?.sms };
        setLoginChannels(ch);
        // 仅开通短信时默认切到短信通道。
        if (!ch.email && ch.sms) setCodeChannel("sms");
      })
      .catch(() => setLoginChannels({ email: false, sms: false }));
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

  function enterAdmin() {
    const from =
      new URLSearchParams(window.location.search).get("from") || "/admin";
    router.push(from);
    router.refresh();
  }

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
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.twoFactorRequired) {
      // 第一步通过：切换到动态码/恢复码输入，票据 10 分钟内有效。
      setTwoFa({ ticket: data.ticket, type: data.challengeType ?? "totp" });
      setTwoFaCode("");
      setLoading(false);
      return;
    }
    if (res.ok) {
      enterAdmin();
    } else {
      // 伪装开启时非入口页调用会得到 404，提示与 401 区分开。
      setError(data.error || "登录失败");
      setLoading(false);
      // 图形码一次失败即换图，避免拿着旧答案反复试。
      if (captchaCfg?.mode === "builtin") refreshCaptcha();
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setLoading(true);
    try {
      if (!resetSent) {
        const res = await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account,
            ...(captchaCfg?.enabled ? { captcha: captchaCode } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "发送失败，请稍后再试");
          if (captchaCfg?.mode === "builtin") refreshCaptcha();
          return;
        }
        setResetSent(true);
        setOkMsg("若该账号存在且绑定了邮箱，重置码已发送，10 分钟内有效。");
      } else {
        const res = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account,
            code: resetCode,
            password: resetPwd,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "重置失败");
          return;
        }
        // 重置成功：回登录态并提示用新密码登录。
        setMode("login");
        setResetSent(false);
        setResetCode("");
        setResetPwd("");
        setPassword("");
        setOkMsg("密码已重置，请使用新密码登录。");
      }
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setMode("login");
    setResetSent(false);
    setResetCode("");
    setResetPwd("");
    setError("");
    setOkMsg("");
  }

  // 验证码登录：发送登录码（purpose=login，60s 倒计时仅为体验，服务端有频控）。
  async function sendLoginCode() {
    setError("");
    setSendCodeErr("");
    if (!codeTarget.trim()) {
      setSendCodeErr(codeChannel === "email" ? "请先填写邮箱" : "请先填写手机号");
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: codeChannel,
          target: codeTarget.trim(),
          purpose: "login",
        }),
      });
      if (res.ok) {
        // 无论账号是否存在都提示已发送（服务端对不存在账号静默成功，防枚举）。
        let left = 60;
        setCodeCd(left);
        const timer = setInterval(() => {
          left -= 1;
          setCodeCd(left);
          if (left <= 0) clearInterval(timer);
        }, 1000);
        setOkMsg(
          codeChannel === "email"
            ? "若该邮箱已注册，登录码已发送，10 分钟内有效。"
            : "若该手机号已注册，登录码已发送，10 分钟内有效。",
        );
        return;
      }
      const data = await res.json().catch(() => ({}));
      setSendCodeErr(data.error || "发送失败，请稍后再试");
    } catch {
      setSendCodeErr("网络异常，请稍后再试");
    } finally {
      setSendingCode(false);
    }
  }

  async function submitCodeLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setLoading(true);
    const res = await fetch("/api/auth/login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: codeChannel,
        target: codeTarget.trim(),
        code: loginCode.trim(),
        ...(captchaCfg?.enabled ? { captcha: captchaCode } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.twoFactorRequired) {
      setTwoFa({ ticket: data.ticket, type: data.challengeType ?? "totp" });
      setTwoFaCode("");
      setLoading(false);
      return;
    }
    if (res.ok) {
      enterAdmin();
    } else {
      setError(data.error || "登录失败");
      setLoading(false);
      if (captchaCfg?.mode === "builtin") refreshCaptcha();
    }
  }

  async function submitTwoFa(e: React.FormEvent) {
    e.preventDefault();
    if (!twoFa) return;
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: twoFa.ticket, code: twoFaCode }),
    });
    if (res.ok) {
      enterAdmin();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "验证失败");
      setLoading(false);
    }
  }

  // 登录与找回密码第一步共用同一套图形验证码区。
  const captchaBlock = captchaCfg?.enabled ? (
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
  ) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <form
        onSubmit={
          twoFa
            ? submitTwoFa
            : mode === "forgot"
              ? submitForgot
              : mode === "codelogin"
                ? submitCodeLogin
                : submit
        }
        className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            {twoFa ? <ShieldCheck size={24} /> : <LayoutDashboard size={24} />}
          </span>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">OboePress</h1>
            <p className="text-sm text-zinc-400">
              {twoFa
                ? "两步验证"
                : mode === "forgot"
                  ? "找回密码"
                  : mode === "codelogin"
                    ? "验证码登录"
                    : "登录管理后台"}
            </p>
          </div>
        </div>

        {twoFa ? (
          <div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <KeyRound size={15} className="text-zinc-500" />
              动态码或恢复码
            </label>
            <input
              value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value.replace(/\s/g, ""))}
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="6 位动态码，或 XXXX-XXXX 恢复码"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tracking-widest outline-none focus:border-indigo-500"
              required
            />
            <p className="mt-2 text-xs text-zinc-500">
              打开验证器 App 获取当前 6 位动态码；手机不可用时可输入任一未使用的恢复码。
            </p>
            <button
              type="button"
              onClick={() => {
                setTwoFa(null);
                setTwoFaCode("");
                setError("");
              }}
              className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <ArrowLeft size={13} /> 返回账号密码步骤
            </button>
          </div>
        ) : mode === "forgot" ? (
          <>
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
            {!resetSent ? (
              <>
                {captchaBlock}
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  输入注册邮箱或昵称，系统将向该账号绑定的邮箱发送 6 位重置码（10 分钟内有效）。
                </p>
              </>
            ) : (
              <>
                <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                  <KeyRound size={15} className="text-zinc-500" />
                  邮箱重置码
                </label>
                <input
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\s/g, ""))}
                  inputMode="numeric"
                  maxLength={8}
                  autoComplete="one-time-code"
                  placeholder="邮件中的 6 位验证码"
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tracking-widest outline-none focus:border-indigo-500"
                  required
                />
                <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                  <Lock size={15} className="text-zinc-500" />
                  新密码
                </label>
                <input
                  type="password"
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  required
                />
              </>
            )}
          </>
        ) : mode === "codelogin" ? (
          <>
            {loginChannels?.email && loginChannels?.sms && (
              <div className="mb-3 flex gap-2">
                {(["email", "sms"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCodeChannel(c);
                      setSendCodeErr("");
                    }}
                    className={
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition " +
                      (codeChannel === c
                        ? "border-indigo-500 bg-indigo-600/10 text-indigo-300"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500")
                    }
                  >
                    {c === "email" ? <Mail size={13} /> : <Smartphone size={13} />}
                    {c === "email" ? "邮箱" : "手机"}
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              {codeChannel === "email" ? (
                <Mail size={15} className="text-zinc-500" />
              ) : (
                <Smartphone size={15} className="text-zinc-500" />
              )}
              {codeChannel === "email" ? "登录邮箱" : "登录手机号"}
            </label>
            <input
              type={codeChannel === "email" ? "email" : "tel"}
              value={codeTarget}
              onChange={(e) => setCodeTarget(e.target.value)}
              autoComplete={codeChannel === "email" ? "email" : "tel"}
              placeholder={
                codeChannel === "email"
                  ? "账号绑定的邮箱"
                  : "账号绑定的手机号"
              }
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              required
            />
            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <KeyRound size={15} className="text-zinc-500" />
              登录验证码
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={loginCode}
                onChange={(e) =>
                  setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 位验证码"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tracking-widest outline-none focus:border-indigo-500"
                required
              />
              <button
                type="button"
                onClick={sendLoginCode}
                disabled={sendingCode || codeCd > 0}
                className="shrink-0 whitespace-nowrap rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50"
              >
                {sendingCode
                  ? "发送中…"
                  : codeCd > 0
                    ? `${codeCd}s 后重发`
                    : "发送验证码"}
              </button>
            </div>
            {sendCodeErr && (
              <p className="mt-1 text-xs text-red-400">{sendCodeErr}</p>
            )}

            {captchaBlock}

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setOkMsg("");
                setSendCodeErr("");
              }}
              className="mt-4 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <ArrowLeft size={13} /> 返回账号密码登录
            </button>
          </>
        ) : (
          <>
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

        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Lock size={15} className="text-zinc-500" />
            密码
          </label>
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setResetSent(false);
              setError("");
              setOkMsg("");
            }}
            className="text-xs text-indigo-400 hover:underline"
          >
            忘记密码？
          </button>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          required
        />

        {captchaBlock}

        {(loginChannels?.email || loginChannels?.sms) && (
          <button
            type="button"
            onClick={() => {
              setMode("codelogin");
              setError("");
              setOkMsg("");
              setSendCodeErr("");
              setLoginCode("");
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
          >
            <Mail size={13} />
            使用邮箱/手机验证码登录
          </button>
        )}
          </>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {okMsg && <p className="mt-4 text-sm text-emerald-400">{okMsg}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading
            ? "处理中…"
            : twoFa
              ? "验证并登录"
              : mode === "forgot"
                ? resetSent
                  ? "重置密码"
                  : "发送重置码"
                : mode === "codelogin"
                  ? "验证码登录"
                  : "登录"}
        </button>

        {!twoFa && mode === "forgot" && (
          <button
            type="button"
            onClick={backToLogin}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft size={13} /> 返回登录
          </button>
        )}

        {!twoFa && mode === "login" && providers.length > 0 && (
          <OAuthButtons
            providers={providers}
            variant="dark"
            redirect={
              new URLSearchParams(window.location.search).get("from") ||
              undefined
            }
          />
        )}

        {!twoFa && mode === "login" && (
          <>
            <p className="mt-4 text-center text-xs text-zinc-500">
              可用邮箱或昵称登录 · 演示账号 admin@cms.local / admin12345
            </p>
            <p className="mt-2 text-center text-xs">
              <Link href="/" className="inline-flex items-center gap-1 text-indigo-400 hover:underline">
                <ArrowLeft size={13} />
                返回站点首页
              </Link>
            </p>
          </>
        )}
      </form>
    </div>
  );
}
