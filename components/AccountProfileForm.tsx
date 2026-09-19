"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRound } from "lucide-react";

/**
 * 个人信息编辑框：修改昵称、登录邮箱与绑定手机。
 * - 昵称可随时修改；
 * - 换成新邮箱 / 新手机时必须先点「发送验证码」并填入 bind 验证码，
 *   服务端才接受变更；手机留空保存即解绑（不需要验证码）。
 * 保存成功后重签会话并 router.refresh()，让服务端渲染的昵称即时生效。
 */
export default function AccountProfileForm({
  initialName,
  initialEmail,
  initialPhone,
}: {
  initialName: string;
  initialEmail: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<"email" | "sms" | null>(null);
  const [emailIn, setEmailIn] = useState(0);
  const [smsIn, setSmsIn] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setBusy(true);
    const res = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, emailCode, phoneCode }),
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

  async function sendCode(channel: "email" | "sms") {
    setMsg("");
    setError("");
    const target = (channel === "email" ? email : phone).trim();
    if (!target) {
      setError(channel === "email" ? "请先填写新邮箱" : "请先填写新手机号");
      return;
    }
    setSending(channel);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, target, purpose: "bind" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "验证码发送失败");
        return;
      }
      const wait = Number(d?.resendAfter) || 60;
      if (channel === "email") {
        setEmailIn(wait);
        const t = setInterval(() => {
          setEmailIn((v) => {
            if (v <= 1) {
              clearInterval(t);
              return 0;
            }
            return v - 1;
          });
        }, 1000);
      } else {
        setSmsIn(wait);
        const t = setInterval(() => {
          setSmsIn((v) => {
            if (v <= 1) {
              clearInterval(t);
              return 0;
            }
            return v - 1;
          });
        }, 1000);
      }
      setMsg("验证码已发送，10 分钟内有效");
    } finally {
      setSending(null);
    }
  }

  const inputCls =
    "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-500";
  const codeBtnCls =
    "shrink-0 rounded-md border border-indigo-500 px-3 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50";

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

      <div className="grid gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">
            邮箱（更换需验证码）
          </span>
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
        <div className="flex gap-2">
          <input
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value)}
            inputMode="numeric"
            maxLength={8}
            placeholder="邮箱验证码"
            autoComplete="one-time-code"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => sendCode("email")}
            disabled={sending !== null || emailIn > 0}
            className={codeBtnCls}
          >
            {sending === "email" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : emailIn > 0 ? (
              `${emailIn}s 后重发`
            ) : (
              "发送验证码"
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">
            手机号（留空即解绑，换绑需验证码）
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            autoComplete="tel"
            className={inputCls}
          />
        </label>
        <div className="flex gap-2">
          <input
            value={phoneCode}
            onChange={(e) => setPhoneCode(e.target.value)}
            inputMode="numeric"
            maxLength={8}
            placeholder="手机验证码"
            autoComplete="one-time-code"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => sendCode("sms")}
            disabled={sending !== null || smsIn > 0}
            className={codeBtnCls}
          >
            {sending === "sms" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : smsIn > 0 ? (
              `${smsIn}s 后重发`
            ) : (
              "发送验证码"
            )}
          </button>
        </div>
      </div>

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
