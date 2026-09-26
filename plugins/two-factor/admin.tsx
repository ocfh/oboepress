"use client";

/**
 * 两步验证自助面板（当前登录用户管理自己的 TOTP）。
 *
 * 状态机：加载状态 → 未绑定（begin 展示密钥 → confirm 展示 20 个恢复码）
 * → 已启用（可凭动态码重生成恢复码、凭密码解绑）。全部通过
 * /api/account/twofa 一个端点完成，插件停用时该端点返回 404。
 */

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Copy,
  Check,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";

type Status = {
  enabled: boolean;
  pending: boolean;
  recoveryRemaining: number;
};

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500";

async function callApi(body?: unknown): Promise<any> {
  const res = await fetch("/api/account/twofa", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "操作失败");
  return data;
}

export default function TwoFactorAdmin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // begin 流程
  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  // 一次性展示的恢复码（仅本次响应里有明文）
  const [shownCodes, setShownCodes] = useState<string[] | null>(null);
  // 已启用后的两个行内操作
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await callApi();
      setStatus(s);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const begin = () =>
    run(async () => {
      const d = await callApi({ action: "begin" });
      setSecret(d.secret);
      setOtpauth(d.otpauth);
      setConfirmCode("");
      setShownCodes(null);
    });

  const confirm = () =>
    run(async () => {
      const d = await callApi({ action: "confirm", code: confirmCode });
      setShownCodes(d.recoveryCodes);
      setSecret("");
      setOtpauth("");
      await refresh();
    });

  const regen = () =>
    run(async () => {
      const d = await callApi({ action: "regen", code: regenCode });
      setShownCodes(d.recoveryCodes);
      setRegenCode("");
      setRegenOpen(false);
      await refresh();
    });

  const disable = () =>
    run(async () => {
      await callApi({ action: "disable", password: disablePw });
      setDisablePw("");
      setDisableOpen(false);
      setShownCodes(null);
      await refresh();
    });

  const copyCodes = async () => {
    if (!shownCodes) return;
    await navigator.clipboard.writeText(shownCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadCodes = () => {
    if (!shownCodes) return;
    const blob = new Blob(
      [`OboePress 两步验证恢复码（生成时间 ${new Date().toLocaleString("zh-CN")}）\n\n${shownCodes.join("\n")}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oboe-twofa-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadError) {
    return (
      <div className="max-w-lg rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
        {loadError}
      </div>
    );
  }
  if (!status) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={15} className="animate-spin" /> 加载中…
      </p>
    );
  }

  const cardCls =
    "max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-5";

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-6 text-zinc-400">
        两步验证在账号密码之外再要求验证器 App 生成的 6 位动态码（TOTP，RFC
        6238）。推荐使用 Google Authenticator、微软验证器、1Password
        等。绑定后请务必保存 20 个恢复码，手机丢失时可用其中任意一个登录。
      </p>

      {/* 当前状态 */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-indigo-400" />
            <span className="text-sm font-semibold text-zinc-100">
              登录两步验证
            </span>
          </div>
          {status.enabled ? (
            <span className="rounded border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300">
              已启用
            </span>
          ) : (
            <span className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              未启用
            </span>
          )}
        </div>

        {status.enabled && (
          <p className="mt-3 text-xs text-zinc-400">
            可用恢复码剩余
            <span
              className={`mx-1 font-semibold ${
                status.recoveryRemaining <= 5 ? "text-amber-400" : "text-zinc-200"
              }`}
            >
              {status.recoveryRemaining}
            </span>
            个
          </p>
        )}

        {!status.enabled && !secret && (
          <div className="mt-4">
            {status.pending && (
              <p className="mb-3 rounded border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
                检测到一次未完成的绑定，重新开始会作废旧密钥。
              </p>
            )}
            <button
              onClick={begin}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
              开始绑定
            </button>
          </div>
        )}

        {/* 绑定步骤：录入密钥 */}
        {!status.enabled && secret && (
          <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
            <p className="text-sm text-zinc-300">
              1. 在验证器中手动录入以下密钥（或点击
              <a
                href={otpauth}
                className="mx-1 text-indigo-400 hover:underline"
              >
                otpauth 链接
              </a>
              直接添加）：
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm tracking-widest text-emerald-300">
                {secret}
              </code>
              <button
                type="button"
                title="复制密钥"
                onClick={() => navigator.clipboard.writeText(secret)}
                className="rounded-md border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800"
              >
                <Copy size={14} />
              </button>
            </div>
            <p className="text-sm text-zinc-300">
              2. 输入验证器当前显示的 6 位动态码完成绑定：
            </p>
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className={`${inputCls} tracking-[0.4em] text-center`}
            />
            <div className="flex gap-2">
              <button
                onClick={confirm}
                disabled={busy || confirmCode.length !== 6}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                确认绑定
              </button>
              <button
                onClick={() => setSecret("")}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 已启用：恢复码管理 / 解绑 */}
        {status.enabled && (
          <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
            {!regenOpen && !disableOpen && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setRegenOpen(true);
                    setShownCodes(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  <RefreshCw size={14} /> 重新生成恢复码
                </button>
                <button
                  onClick={() => setDisableOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-red-900 px-3 py-2 text-sm text-red-300 hover:bg-red-950/50"
                >
                  <ShieldOff size={14} /> 关闭两步验证
                </button>
              </div>
            )}

            {regenOpen && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  输入当前 6 位动态码。旧恢复码将立即全部作废。
                </p>
                <input
                  value={regenCode}
                  onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="123456"
                  className={`${inputCls} tracking-[0.4em]`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={regen}
                    disabled={busy || regenCode.length !== 6}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    生成新恢复码
                  </button>
                  <button
                    onClick={() => setRegenOpen(false)}
                    className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {disableOpen && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  输入当前账号的登录密码以确认解绑。解绑后登录将不再需要动态码。
                </p>
                <input
                  type="password"
                  value={disablePw}
                  onChange={(e) => setDisablePw(e.target.value)}
                  autoComplete="current-password"
                  placeholder="登录密码"
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <button
                    onClick={disable}
                    disabled={busy || !disablePw}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    确认关闭
                  </button>
                  <button
                    onClick={() => setDisableOpen(false)}
                    className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      {/* 恢复码一次性明文展示 */}
      {shownCodes && (
        <div className={cardCls}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">
              备用恢复码（{shownCodes.length} 个）
            </h3>
            <div className="flex gap-2">
              <button
                onClick={copyCodes}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                复制
              </button>
              <button
                onClick={downloadCodes}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                <Download size={13} /> 下载
              </button>
            </div>
          </div>
          <p className="mt-2 rounded border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            每个恢复码只能使用一次，离开本页后无法再次查看，请立即复制或下载并妥善保管。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {shownCodes.map((c) => (
              <code
                key={c}
                className="rounded bg-zinc-950 px-2 py-1 text-center font-mono text-sm tracking-widest text-zinc-200"
              >
                {c}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
