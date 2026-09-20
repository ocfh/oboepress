"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react";

/**
 * 通知与验证码后台：SMTP 发信、邮件 Webhook、短信 Webhook、注册验证码开关。
 * SMTP 密码保存时留空表示不修改（服务端掩码下发）。
 */

type Webhook = { url: string; method: "POST" | "GET" | "PUT"; headers: string; body: string };
type AliyunSms = {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  codeParam: string;
  endpoint: string;
};
type TencentSms = {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
  endpoint: string;
};
type NotifyCfg = {
  smtp: { host: string; port: number; security: "TLS" | "STARTTLS" | "NONE"; user: string; pass: string; from: string };
  email: { enabled: boolean; via: "smtp" | "webhook"; webhook: Webhook };
  sms: {
    enabled: boolean;
    provider: "webhook" | "aliyun" | "tencent";
    signature: string;
    webhook: Webhook;
    aliyun: AliyunSms;
    tencent: TencentSms;
  };
  register: { emailVerify: boolean; phoneVerify: boolean };
  login: { emailVerify: boolean; phoneVerify: boolean };
};

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500";
const labelCls = "mb-1 block text-xs font-medium text-zinc-400";

const toggleCls =
  "relative inline-flex shrink-0 cursor-pointer items-center " +
  "[&_span]:h-6 [&_span]:w-11 [&_span]:rounded-full [&_span]:bg-zinc-700 [&_span]:transition " +
  "peer-checked:[&_span]:bg-indigo-600 " +
  "[&_span]:after:absolute [&_span]:after:left-0.5 [&_span]:after:top-0.5 " +
  "[&_span]:after:h-5 [&_span]:after:w-5 [&_span]:after:rounded-full " +
  "[&_span]:after:bg-white [&_span]:after:transition " +
  "peer-checked:[&_span]:after:translate-x-5";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={toggleCls}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

function Card({ title, desc, enabled, onToggle, children }: {
  title: string;
  desc: string;
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{desc}</p>
        </div>
        {onToggle && <Toggle checked={!!enabled} onChange={onToggle} />}
      </div>
      {children && <div className="mt-5 space-y-3">{children}</div>}
    </div>
  );
}

function WebhookFields({
  value,
  onChange,
  showBody = true,
}: {
  value: Webhook;
  onChange: (w: Webhook) => void;
  showBody?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div>
        <label className={labelCls}>接口 URL（支持 {"{{target}}"} {"{{code}}"} {"{{sign}}"} 占位符）</label>
        <input className={inputCls} value={value.url} spellCheck={false}
          placeholder="https://sms.example.com/send?phone={{target}}&code={{code}}"
          onChange={(e) => onChange({ ...value, url: e.target.value })} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-1">
          <label className={labelCls}>方法</label>
          <select className={inputCls} value={value.method}
            onChange={(e) => onChange({ ...value, method: e.target.value as Webhook["method"] })}>
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
        <div className="col-span-3">
          <label className={labelCls}>短信 / 邮件签名（{"{{sign}}"}）</label>
          <input className={inputCls} value={value.headers}
            onChange={(e) => onChange({ ...value, headers: e.target.value })}
            placeholder={'Content-Type: application/json（一行一个请求头，或粘贴 JSON）'} />
        </div>
      </div>
      {showBody && value.method !== "GET" && (
        <div>
          <label className={labelCls}>请求体模板（GET 时忽略）</label>
          <textarea className={`${inputCls} h-20 font-mono text-xs`} value={value.body} spellCheck={false}
            onChange={(e) => onChange({ ...value, body: e.target.value })} />
        </div>
      )}
    </div>
  );
}

export default function NotifyAdmin() {
  const [cfg, setCfg] = useState<NotifyCfg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // 测试通道：邮件 / 短信
  const [testChannel, setTestChannel] = useState<"email" | "sms" | null>(null);
  const [testTarget, setTestTarget] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // 密码独立草稿：GET 回传的 pass 恒为空串（掩码），保存时留空必须「不下发 pass」，
  // 否则服务端会把空串当成清空密码。
  const [passDraft, setPassDraft] = useState("");

  useEffect(() => {
    fetch("/api/notify", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => setLoadError(true));
  }, []);

  /** 组装下发体：密码 / 短信密钥留空时剔除该键（保留原值），填写了才覆盖。 */
  function buildPayload(): NotifyCfg {
    const smtp: NotifyCfg["smtp"] = { ...cfg!.smtp };
    if (passDraft) smtp.pass = passDraft;
    else delete (smtp as Partial<NotifyCfg["smtp"]>).pass;
    const sms: NotifyCfg["sms"] = {
      ...cfg!.sms,
      aliyun: { ...cfg!.sms.aliyun },
      tencent: { ...cfg!.sms.tencent },
    };
    if (!sms.aliyun.accessKeySecret) {
      delete (sms.aliyun as Partial<AliyunSms>).accessKeySecret;
    }
    if (!sms.tencent.secretKey) {
      delete (sms.tencent as Partial<TencentSms>).secretKey;
    }
    return { ...cfg!, smtp, sms };
  }

  async function save(): Promise<boolean> {
    if (!cfg) return false;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/notify", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    setSaving(false);
    if (res.ok) {
      const saved = await res.json();
      // 掩码密码：保持服务端回传（空串），草稿用后即清。
      setCfg(saved);
      setPassDraft("");
      setMsg({ kind: "ok", text: "通知设置已保存并立即生效" });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error ?? "保存失败" });
      return false;
    }
    return true;
  }

  async function test(channel: "email" | "sms") {
    if (!testTarget.trim()) {
      setTestMsg({ kind: "err", text: channel === "email" ? "请填写收件邮箱" : "请填写接收手机号" });
      return;
    }
    setTesting(true);
    setTestMsg(null);
    try {
      // 先保存再测试：确保投递使用当前编辑中的配置（密码留空不影响已存值）。
      if (!(await save())) return;
      const res = await fetch("/api/notify/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, target: testTarget.trim() }),
      });
      if (res.ok) setTestMsg({ kind: "ok", text: channel === "email" ? "测试邮件已发送，请查收" : "测试短信已触发，请查收" });
      else {
        const j = await res.json().catch(() => ({}));
        setTestMsg({ kind: "err", text: j.error ?? "发送失败" });
      }
    } finally {
      setTesting(false);
    }
  }

  if (loadError) return <p className="text-sm text-rose-400">通知设置加载失败，请刷新重试。</p>;
  if (!cfg) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">通知与验证码</h1>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "保存中…" : "保存更改"}
        </button>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
            msg.kind === "ok"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-rose-800 bg-rose-950/40 text-rose-300"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      <Card title="SMTP 发信服务器" desc="内置零依赖 SMTP 客户端，支持 465（TLS）、587（STARTTLS）与 25（明文）。密码保存后留空表示不修改。">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className={labelCls}>服务器地址</label>
            <input className={inputCls} value={cfg.smtp.host} spellCheck={false}
              placeholder="smtp.example.com"
              onChange={(e) => setCfg({ ...cfg, smtp: { ...cfg.smtp, host: e.target.value } })} />
          </div>
          <div>
            <label className={labelCls}>端口</label>
            <input type="number" className={inputCls} value={cfg.smtp.port}
              onChange={(e) => setCfg({ ...cfg, smtp: { ...cfg.smtp, port: Number(e.target.value) || 465 } })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>加密方式</label>
            <select className={inputCls} value={cfg.smtp.security}
              onChange={(e) => setCfg({ ...cfg, smtp: { ...cfg.smtp, security: e.target.value as NotifyCfg["smtp"]["security"] } })}>
              <option value="TLS">TLS（465）</option>
              <option value="STARTTLS">STARTTLS（587）</option>
              <option value="NONE">不加密（25）</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>发件人地址（From）</label>
            <input className={inputCls} value={cfg.smtp.from} spellCheck={false}
              placeholder="blog@example.com"
              onChange={(e) => setCfg({ ...cfg, smtp: { ...cfg.smtp, from: e.target.value } })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>用户名</label>
            <input className={inputCls} value={cfg.smtp.user} spellCheck={false} autoComplete="off"
              onChange={(e) => setCfg({ ...cfg, smtp: { ...cfg.smtp, user: e.target.value } })} />
          </div>
          <div>
            <label className={labelCls}>授权码 / 密码</label>
            <input
              type="password"
              className={inputCls}
              value={passDraft}
              autoComplete="new-password"
              placeholder={cfg.smtp.host ? "••••••（留空保持不变）" : "未设置"}
              onChange={(e) => setPassDraft(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card
        title="邮件验证码通道"
        desc="开启后注册可强制邮箱验证。可走内置 SMTP，或对接任意第三方邮件 HTTP 接口。"
        enabled={cfg.email.enabled}
        onToggle={(v) => setCfg({ ...cfg, email: { ...cfg.email, enabled: v } })}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCfg({ ...cfg, email: { ...cfg.email, via: "smtp" } })}
            className={`rounded-md border px-3 py-2 text-xs transition ${
              cfg.email.via === "smtp" ? "border-indigo-500 bg-indigo-950/40 text-zinc-100" : "border-zinc-700 text-zinc-400"
            }`}
          >
            通过 SMTP 发送
          </button>
          <button
            type="button"
            onClick={() => setCfg({ ...cfg, email: { ...cfg.email, via: "webhook" } })}
            className={`rounded-md border px-3 py-2 text-xs transition ${
              cfg.email.via === "webhook" ? "border-indigo-500 bg-indigo-950/40 text-zinc-100" : "border-zinc-700 text-zinc-400"
            }`}
          >
            通过自定义接口
          </button>
        </div>
        {cfg.email.via === "webhook" && (
          <WebhookFields
            value={cfg.email.webhook}
            showBody={false}
            onChange={(w) => setCfg({ ...cfg, email: { ...cfg.email, webhook: w } })}
          />
        )}
      </Card>

      <Card
        title="短信验证码通道"
        desc="内置阿里云、腾讯云短信签名调用（零依赖），也可通过任意自定义 HTTP 网关对接。密钥保存后留空表示不修改。"
        enabled={cfg.sms.enabled}
        onToggle={(v) => setCfg({ ...cfg, sms: { ...cfg.sms, enabled: v } })}
      >
        <div className="grid grid-cols-3 gap-2">
          {([
            ["aliyun", "阿里云短信"],
            ["tencent", "腾讯云短信"],
            ["webhook", "自定义接口"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCfg({ ...cfg, sms: { ...cfg.sms, provider: key } })}
              className={`rounded-md border px-3 py-2 text-xs transition ${
                cfg.sms.provider === key
                  ? "border-indigo-500 bg-indigo-950/40 text-zinc-100"
                  : "border-zinc-700 text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {cfg.sms.provider === "webhook" && (
          <>
            <div>
              <label className={labelCls}>短信签名（用于 {"{{sign}}"}，如 OboePress）</label>
              <input className={inputCls} value={cfg.sms.signature}
                onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, signature: e.target.value } })} />
            </div>
            <WebhookFields
              value={cfg.sms.webhook}
              onChange={(w) => setCfg({ ...cfg, sms: { ...cfg.sms, webhook: w } })}
            />
          </>
        )}

        {cfg.sms.provider === "aliyun" && (
          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>AccessKey ID</label>
                <input className={inputCls} spellCheck={false} autoComplete="off"
                  value={cfg.sms.aliyun.accessKeyId}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, aliyun: { ...cfg.sms.aliyun, accessKeyId: e.target.value } } })} />
              </div>
              <div>
                <label className={labelCls}>AccessKey Secret</label>
                <input type="password" className={inputCls} autoComplete="new-password"
                  placeholder={cfg.sms.aliyun.accessKeyId ? "••••••（留空保持不变）" : "未设置"}
                  value={cfg.sms.aliyun.accessKeySecret}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, aliyun: { ...cfg.sms.aliyun, accessKeySecret: e.target.value } } })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>短信签名名称（不带【】）</label>
                <input className={inputCls} placeholder="OboePress"
                  value={cfg.sms.aliyun.signName}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, aliyun: { ...cfg.sms.aliyun, signName: e.target.value } } })} />
              </div>
              <div>
                <label className={labelCls}>模板 CODE</label>
                <input className={inputCls} spellCheck={false} placeholder="SMS_123456789"
                  value={cfg.sms.aliyun.templateCode}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, aliyun: { ...cfg.sms.aliyun, templateCode: e.target.value } } })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>验证码模板变量名（默认 code）</label>
                <input className={inputCls} spellCheck={false} placeholder="code"
                  value={cfg.sms.aliyun.codeParam}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, aliyun: { ...cfg.sms.aliyun, codeParam: e.target.value } } })} />
              </div>
              <div>
                <label className={labelCls}>接入点（高级，留空默认国内站）</label>
                <input className={inputCls} spellCheck={false} placeholder="https://dysmsapi.aliyuncs.com"
                  value={cfg.sms.aliyun.endpoint}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, aliyun: { ...cfg.sms.aliyun, endpoint: e.target.value } } })} />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">
              {"模板内容需含一个验证码变量，如「您的验证码为 ${code}，10 分钟内有效」；变量名与上方填写一致。"}
            </p>
          </div>
        )}

        {cfg.sms.provider === "tencent" && (
          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>SecretId</label>
                <input className={inputCls} spellCheck={false} autoComplete="off"
                  value={cfg.sms.tencent.secretId}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, tencent: { ...cfg.sms.tencent, secretId: e.target.value } } })} />
              </div>
              <div>
                <label className={labelCls}>SecretKey</label>
                <input type="password" className={inputCls} autoComplete="new-password"
                  placeholder={cfg.sms.tencent.secretId ? "••••••（留空保持不变）" : "未设置"}
                  value={cfg.sms.tencent.secretKey}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, tencent: { ...cfg.sms.tencent, secretKey: e.target.value } } })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>SdkAppId（短信应用 ID）</label>
                <input className={inputCls} spellCheck={false} placeholder="1400000000"
                  value={cfg.sms.tencent.sdkAppId}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, tencent: { ...cfg.sms.tencent, sdkAppId: e.target.value } } })} />
              </div>
              <div>
                <label className={labelCls}>模板 ID（纯数字）</label>
                <input className={inputCls} spellCheck={false} placeholder="1234567"
                  value={cfg.sms.tencent.templateId}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, tencent: { ...cfg.sms.tencent, templateId: e.target.value } } })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>短信签名内容</label>
                <input className={inputCls} placeholder="OboePress"
                  value={cfg.sms.tencent.signName}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, tencent: { ...cfg.sms.tencent, signName: e.target.value } } })} />
              </div>
              <div>
                <label className={labelCls}>地域（默认 ap-guangzhou）</label>
                <input className={inputCls} spellCheck={false} placeholder="ap-guangzhou"
                  value={cfg.sms.tencent.region}
                  onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, tencent: { ...cfg.sms.tencent, region: e.target.value } } })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>接入点（高级，留空按地域推导）</label>
              <input className={inputCls} spellCheck={false} placeholder="https://sms.ap-guangzhou.tencentcloudapi.com"
                value={cfg.sms.tencent.endpoint}
                onChange={(e) => setCfg({ ...cfg, sms: { ...cfg.sms, tencent: { ...cfg.sms.tencent, endpoint: e.target.value } } })} />
            </div>
            <p className="text-[11px] text-zinc-500">
              大陆手机号自动补 +86，其他地区请在测试/注册时携带国家码；验证码模板只允许一个变量。
            </p>
          </div>
        )}
      </Card>

      <Card title="注册验证码策略" desc="开启后，前台注册对应字段必须通过验证码校验；通道未开启时该开关不生效。开关也可在会员注册页管理。">
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <Mail size={14} className="text-zinc-500" /> 注册时强制邮箱验证
          </div>
          <Toggle
            checked={cfg.register.emailVerify}
            onChange={(v) => setCfg({ ...cfg, register: { ...cfg.register, emailVerify: v } })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <MessageSquare size={14} className="text-zinc-500" /> 注册时强制手机验证
          </div>
          <Toggle
            checked={cfg.register.phoneVerify}
            onChange={(v) => setCfg({ ...cfg, register: { ...cfg.register, phoneVerify: v } })}
          />
        </div>
        <p className="text-[11px] text-zinc-500">
          字段是否必填仍由
          <Link href="/admin/members" className="text-indigo-400 hover:underline"> 会员注册 </Link>
          页的「邮箱必填 / 手机号必填」控制；选填字段填写了才会校验对应验证码。
        </p>
      </Card>

      <Card title="登录验证码策略" desc="开启后，登录页允许使用邮箱/手机验证码免密登录；通道未开启时对应方式不显示。">
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <Mail size={14} className="text-zinc-500" /> 允许邮箱验证码登录
          </div>
          <Toggle
            checked={cfg.login.emailVerify}
            onChange={(v) => setCfg({ ...cfg, login: { ...cfg.login, emailVerify: v } })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <MessageSquare size={14} className="text-zinc-500" /> 允许手机验证码登录
          </div>
          <Toggle
            checked={cfg.login.phoneVerify}
            onChange={(v) => setCfg({ ...cfg, login: { ...cfg.login, phoneVerify: v } })}
          />
        </div>
      </Card>

      <Card title="通道测试" desc="保存当前配置后，立即发送一封测试邮件或一条测试短信验证可用性。">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} max-w-xs`}
            value={testTarget}
            onChange={(e) => setTestTarget(e.target.value)}
            placeholder="收件邮箱 / 手机号"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => { setTestChannel("email"); test("email"); }}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50"
          >
            {testing && testChannel === "email" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            测试邮件
          </button>
          <button
            type="button"
            onClick={() => { setTestChannel("sms"); test("sms"); }}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50"
          >
            {testing && testChannel === "sms" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            测试短信
          </button>
        </div>
        {testMsg && (
          <p className={`text-xs ${testMsg.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{testMsg.text}</p>
        )}
      </Card>
    </div>
  );
}
