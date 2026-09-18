"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, Mail, Smartphone, Lock, ShieldCheck, Loader2, ArrowLeft } from "lucide-react";

/**
 * 前台会员注册表单。渲染在 catch-all 的注册路径上（外壳为活动主题的公开
 * 布局），字段与验证码区由服务端下发的公开配置驱动；注册成功即写会话，
 * 跳回首页。配置形态与 /api/members/config 保持一致。
 */
export type RegisterConfig = {
  enabled: boolean;
  path: string | null;
  emailRequired: boolean;
  phoneRequired: boolean;
  emailVerify: boolean;
  phoneVerify: boolean;
  defaultRole: "subscriber" | "author";
  captcha: { enabled: boolean; mode: "builtin" | "custom" | null };
};

const labelCls = "flex items-center gap-2 text-sm";
const inputCls =
  "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-[#324057] outline-none transition focus:border-[var(--primary-color)]";

/** 验证码输入行：输入框 + 发送按钮（60 秒倒计时，间隔由服务端频控兜底）。 */
function CodeField({
  value,
  onChange,
  onSend,
  countdown,
  sending,
  sendError,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  countdown: number;
  sending: boolean;
  sendError: string;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6 位验证码"
          className={inputCls}
          style={{ borderColor: "var(--border-color)" }}
          required
        />
        <button
          type="button"
          onClick={onSend}
          disabled={countdown > 0 || sending}
          className="mt-1 shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-xs transition hover:opacity-90 disabled:opacity-50"
          style={{
            borderColor: "var(--border-color)",
            color: "var(--primary-color)",
          }}
        >
          {sending ? "发送中…" : countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
        </button>
      </div>
      {sendError && <p className="mt-1 text-xs text-red-500">{sendError}</p>}
    </div>
  );
}

export default function RegisterForm({ config }: { config: RegisterConfig }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [imgNonce, setImgNonce] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<"email" | "sms" | null>(null);
  const [emailCd, setEmailCd] = useState(0);
  const [phoneCd, setPhoneCd] = useState(0);
  const [emailCodeErr, setEmailCodeErr] = useState("");
  const [phoneCodeErr, setPhoneCodeErr] = useState("");

  const captchaEnabled = config.captcha.enabled;
  const captchaMode = config.captcha.mode;

  const refreshCaptcha = () => {
    setCaptcha("");
    setImgNonce(Date.now());
  };

  // 倒计时仅为前端体验；服务端 60 秒频控才是真正的边界。
  function startCountdown(setter: (n: number) => void) {
    let left = 60;
    setter(left);
    const timer = setInterval(() => {
      left -= 1;
      setter(left);
      if (left <= 0) clearInterval(timer);
    }, 1000);
  }

  async function sendCode(channel: "email" | "sms") {
    const target = channel === "email" ? email.trim() : phone.trim();
    const setErr = channel === "email" ? setEmailCodeErr : setPhoneCodeErr;
    setErr("");
    if (!target) {
      setErr(channel === "email" ? "请先填写邮箱" : "请先填写手机号");
      return;
    }
    setSending(channel);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, target }),
      });
      if (res.ok) {
        startCountdown(channel === "email" ? setEmailCd : setPhoneCd);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "发送失败，请稍后再试");
    } catch {
      setErr("网络异常，请稍后再试");
    } finally {
      setSending(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // 前置轻校验，服务端仍会完整复核。
    if (name.trim().length < 2) {
      setError("昵称至少 2 个字符");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    if (config.emailRequired && !email.trim()) {
      setError("请填写邮箱");
      return;
    }
    if (config.phoneRequired && !phone.trim()) {
      setError("请填写手机号");
      return;
    }
    if (config.emailVerify && email.trim() && !emailCode.trim()) {
      setError("请填写邮箱验证码");
      return;
    }
    if (config.phoneVerify && phone.trim() && !phoneCode.trim()) {
      setError("请填写手机验证码");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          password,
          ...(config.emailVerify && email.trim()
            ? { emailCode: emailCode.trim() }
            : {}),
          ...(config.phoneVerify && phone.trim()
            ? { phoneCode: phoneCode.trim() }
            : {}),
          ...(captchaEnabled ? { captcha: captcha.trim() } : {}),
        }),
      });
      if (res.ok) {
        // 注册即登录：刷新让公开布局拿到新会话。
        router.push("/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "注册失败，请稍后再试");
      if (captchaMode === "builtin") refreshCaptcha();
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={labelCls} style={{ color: "var(--text-color-2)" }}>
          <User size={15} style={{ color: "var(--text-color-3)" }} />
          昵称
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          autoComplete="username"
          placeholder="2~32 个字符，注册后用于登录"
          className={inputCls}
          style={{ borderColor: "var(--border-color)" }}
          required
        />
      </div>

      <div>
        <label className={labelCls} style={{ color: "var(--text-color-2)" }}>
          <Mail size={15} style={{ color: "var(--text-color-3)" }} />
          邮箱{config.emailRequired ? "" : "（可选）"}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={120}
          autoComplete="email"
          className={inputCls}
          style={{ borderColor: "var(--border-color)" }}
          required={config.emailRequired}
        />
        {config.emailVerify && (
          <CodeField
            value={emailCode}
            onChange={setEmailCode}
            onSend={() => sendCode("email")}
            countdown={emailCd}
            sending={sending === "email"}
            sendError={emailCodeErr}
          />
        )}
      </div>

      <div>
        <label className={labelCls} style={{ color: "var(--text-color-2)" }}>
          <Smartphone size={15} style={{ color: "var(--text-color-3)" }} />
          手机号{config.phoneRequired ? "" : "（可选）"}
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={20}
          autoComplete="tel"
          placeholder="中国大陆手机号或 + 开头的国际号码"
          className={inputCls}
          style={{ borderColor: "var(--border-color)" }}
          required={config.phoneRequired}
        />
        {config.phoneVerify && (
          <CodeField
            value={phoneCode}
            onChange={setPhoneCode}
            onSend={() => sendCode("sms")}
            countdown={phoneCd}
            sending={sending === "sms"}
            sendError={phoneCodeErr}
          />
        )}
      </div>

      <div>
        <label className={labelCls} style={{ color: "var(--text-color-2)" }}>
          <Lock size={15} style={{ color: "var(--text-color-3)" }} />
          密码
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          placeholder="至少 8 位"
          className={inputCls}
          style={{ borderColor: "var(--border-color)" }}
          required
        />
      </div>

      {captchaEnabled && (
        <div>
          <label className={labelCls} style={{ color: "var(--text-color-2)" }}>
            <ShieldCheck size={15} style={{ color: "var(--text-color-3)" }} />
            验证码
          </label>
          {captchaMode === "builtin" ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                maxLength={4}
                autoComplete="off"
                spellCheck={false}
                className={`${inputCls} w-32 uppercase tracking-widest`}
                style={{ borderColor: "var(--border-color)" }}
                required
              />
              {/* Referer 为注册路径时验证码接口才出图（见 isRegisterReferer）。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/captcha/image?t=${imgNonce}`}
                alt="验证码"
                title="看不清？点击刷新"
                onClick={refreshCaptcha}
                className="h-[38px] w-[120px] shrink-0 cursor-pointer rounded-md border"
                style={{ borderColor: "var(--border-color)" }}
              />
            </div>
          ) : (
            <input
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              placeholder="第三方验证码凭证"
              className={inputCls}
              style={{ borderColor: "var(--border-color)" }}
              required
            />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: "var(--primary-color)" }}
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {loading ? "注册中…" : "注册"}
      </button>

      <p className="text-center text-xs" style={{ color: "var(--text-color-3)" }}>
        注册即代表同意站点规则
      </p>
      <p className="text-center text-xs">
        <Link
          href="/"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--primary-color)" }}
        >
          <ArrowLeft size={13} />
          返回首页
        </Link>
      </p>
    </form>
  );
}
