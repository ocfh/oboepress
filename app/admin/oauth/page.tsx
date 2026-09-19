"use client";

import { useEffect, useState } from "react";
import {
  Share2,
  Save,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
} from "lucide-react";
import type { AdminProvider } from "@/lib/services/oauth";

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500";
const selectCls = inputCls + " appearance-none";

const toggleCls =
  "relative inline-flex shrink-0 cursor-pointer items-center " +
  "[&_span]:h-6 [&_span]:w-11 [&_span]:rounded-full [&_span]:bg-zinc-700 [&_span]:transition " +
  "peer-checked:[&_span]:bg-indigo-600 " +
  "[&_span]:after:absolute [&_span]:after:left-0.5 [&_span]:after:top-0.5 " +
  "[&_span]:after:h-5 [&_span]:after:w-5 [&_span]:after:rounded-full " +
  "[&_span]:after:bg-white [&_span]:after:transition " +
  "peer-checked:[&_span]:after:translate-x-5";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={toggleCls}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span />
    </label>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

/** 单个提供商编辑卡：预设只露凭证与开关；自定义额外露端点/字段映射。 */
function ProviderCard({
  provider,
  origin,
  onSaved,
  onDeleted,
  pushMsg,
}: {
  provider: AdminProvider;
  origin: string;
  onSaved: (list: AdminProvider[]) => void;
  onDeleted: (list: AdminProvider[]) => void;
  pushMsg: (kind: "ok" | "err", text: string) => void;
}) {
  const c = provider.config;
  const [enabled, setEnabled] = useState(c.enabled);
  const [clientId, setClientId] = useState(c.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [allowCreate, setAllowCreate] = useState(c.allowCreate);
  const [mergeByEmail, setMergeByEmail] = useState(c.mergeByEmail);
  const [label, setLabel] = useState(c.label ?? "");
  const [authorizeUrl, setAuthorizeUrl] = useState(c.authorizeUrl ?? "");
  const [tokenUrl, setTokenUrl] = useState(c.tokenUrl ?? "");
  const [userInfoUrl, setUserInfoUrl] = useState(c.userInfoUrl ?? "");
  const [scope, setScope] = useState(c.scope ?? "");
  const [tokenMethod, setTokenMethod] = useState(c.tokenMethod ?? "POST");
  const [tokenAuth, setTokenAuth] = useState(c.tokenAuth ?? "body");
  const [userInfoAuth, setUserInfoAuth] = useState(c.userInfoAuth ?? "bearer");
  const [openIdField, setOpenIdField] = useState(c.openIdField ?? "");
  const [nicknameField, setNicknameField] = useState(c.nicknameField ?? "name");
  const [avatarField, setAvatarField] = useState(c.avatarField ?? "avatar");
  const [emailField, setEmailField] = useState(c.emailField ?? "");
  const [emailVerifiedField, setEmailVerifiedField] = useState(
    c.emailVerifiedField ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const callbackUrl = `${origin}/api/oauth/${encodeURIComponent(provider.key)}/callback`;

  async function save() {
    setSaving(true);
    const patch: Record<string, unknown> = {
      enabled,
      clientId,
      clientSecret: secret, // 空串=保留原密钥
      allowCreate,
      mergeByEmail,
    };
    if (provider.custom) {
      Object.assign(patch, {
        label,
        authorizeUrl,
        tokenUrl,
        userInfoUrl,
        scope,
        tokenMethod,
        tokenAuth,
        userInfoAuth,
        openIdField,
        nicknameField,
        avatarField,
        emailField,
        emailVerifiedField,
      });
    }
    try {
      const res = await fetch("/api/oauth-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: provider.key, patch }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushMsg("err", d.error ?? "保存失败");
        return;
      }
      setSecret("");
      onSaved(d as AdminProvider[]);
      pushMsg("ok", `${provider.label} 配置已保存`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`确定删除自定义登录方式「${provider.label}」？其全部绑定关系也会清除。`))
      return;
    setDeleting(true);
    try {
      const res = await fetch("/api/oauth-config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: provider.key }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushMsg("err", d.error ?? "删除失败");
        return;
      }
      onDeleted(d as AdminProvider[]);
      pushMsg("ok", `已删除 ${provider.label}`);
    } finally {
      setDeleting(false);
    }
  }

  function copyCallback() {
    navigator.clipboard
      .writeText(callbackUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  const status = enabled
    ? provider.complete
      ? { cls: "text-emerald-400 border-emerald-800 bg-emerald-950/50", text: "已启用" }
      : { cls: "text-amber-400 border-amber-800 bg-amber-950/50", text: "配置不完整" }
    : { cls: "text-zinc-400 border-zinc-700 bg-zinc-900", text: "未启用" };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-5 py-4">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: provider.color }}
        >
          {provider.label.slice(0, 1)}
        </span>
        <h2 className="text-sm font-semibold text-zinc-100">{provider.label}</h2>
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {provider.key}
        </code>
        {provider.custom && (
          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
            自定义
          </span>
        )}
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${status.cls}`}>
          {status.text}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle checked={enabled} onChange={setEnabled} />
          {provider.custom && (
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-red-600 hover:text-red-400 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              删除
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="客户端 ID（AppID / Client ID）">
            <input
              className={inputCls}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field
            label="客户端密钥（AppSecret）"
            hint={provider.hasSecret ? "已配置密钥，留空保存表示不修改" : undefined}
          >
            <input
              type="password"
              className={inputCls}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={provider.hasSecret ? "已配置，留空保持不变" : "未配置"}
              autoComplete="new-password"
            />
          </Field>
        </div>

        {provider.custom && (
          <>
            <Field label="显示名称">
              <input
                className={inputCls}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="授权地址 Authorize URL">
                <input
                  className={inputCls}
                  value={authorizeUrl}
                  onChange={(e) => setAuthorizeUrl(e.target.value)}
                  placeholder="https://provider/oauth/authorize"
                />
              </Field>
              <Field label="令牌地址 Token URL">
                <input
                  className={inputCls}
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  placeholder="https://provider/oauth/token"
                />
              </Field>
              <Field label="用户信息地址 UserInfo URL">
                <input
                  className={inputCls}
                  value={userInfoUrl}
                  onChange={(e) => setUserInfoUrl(e.target.value)}
                  placeholder="https://provider/api/user"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="授权范围 Scope">
                <input
                  className={inputCls}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </Field>
              <Field label="令牌请求方式">
                <select
                  className={selectCls}
                  value={tokenMethod}
                  onChange={(e) =>
                    setTokenMethod(e.target.value === "GET" ? "GET" : "POST")
                  }
                >
                  <option value="POST">POST 表单</option>
                  <option value="GET">GET</option>
                </select>
              </Field>
              <Field label="客户端凭证传递">
                <select
                  className={selectCls}
                  value={tokenAuth}
                  onChange={(e) =>
                    setTokenAuth(e.target.value === "basic" ? "basic" : "body")
                  }
                >
                  <option value="body">请求体字段</option>
                  <option value="basic">HTTP Basic</option>
                </select>
              </Field>
              <Field label="用户信息令牌传递">
                <select
                  className={selectCls}
                  value={userInfoAuth}
                  onChange={(e) =>
                    setUserInfoAuth(
                      e.target.value === "query" ? "query" : "bearer",
                    )
                  }
                >
                  <option value="bearer">Bearer 头</option>
                  <option value="query">Query 参数</option>
                </select>
              </Field>
            </div>
            <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
              用户信息响应字段映射（支持点路径，如 <code>data.id</code>；邮箱相关留空表示不获取）
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="唯一 ID 字段 *">
                <input
                  className={inputCls}
                  value={openIdField}
                  onChange={(e) => setOpenIdField(e.target.value)}
                  placeholder="id / openid / data.id"
                />
              </Field>
              <Field label="昵称字段">
                <input
                  className={inputCls}
                  value={nicknameField}
                  onChange={(e) => setNicknameField(e.target.value)}
                />
              </Field>
              <Field label="头像字段">
                <input
                  className={inputCls}
                  value={avatarField}
                  onChange={(e) => setAvatarField(e.target.value)}
                />
              </Field>
              <Field label="邮箱字段">
                <input
                  className={inputCls}
                  value={emailField}
                  onChange={(e) => setEmailField(e.target.value)}
                  placeholder="留空=不获取邮箱"
                />
              </Field>
              <Field label="邮箱已验证字段">
                <input
                  className={inputCls}
                  value={emailVerifiedField}
                  onChange={(e) => setEmailVerifiedField(e.target.value)}
                  placeholder="如 email_verified"
                />
              </Field>
            </div>
          </>
        )}

        <ToggleRow
          label="允许新用户登录"
          hint="关闭后，未注册的第三方身份必须先登录本站账号并手动绑定"
          checked={allowCreate}
          onChange={setAllowCreate}
        />
        <ToggleRow
          label="按已验证邮箱合并账号"
          hint="仅当提供商明确返回邮箱已验证时，才匹配并合并到同邮箱的本站账号"
          checked={mergeByEmail}
          onChange={setMergeByEmail}
        />

        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
            回调地址：{callbackUrl}
          </code>
          <button
            type="button"
            onClick={copyCallback}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:border-indigo-500 hover:text-indigo-300"
            title="复制回调地址"
          >
            {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/** 新增自定义 OAuth2 提供商的折叠表单。 */
function AddCustomCard({
  onCreated,
  pushMsg,
}: {
  onCreated: (list: AdminProvider[]) => void;
  pushMsg: (kind: "ok" | "err", text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank = {
    slug: "",
    label: "",
    authorizeUrl: "",
    tokenUrl: "",
    userInfoUrl: "",
    openIdField: "",
  };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/oauth-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushMsg("err", d.error ?? "创建失败");
        return;
      }
      // POST 仅回 {key}，再拉一次完整列表。
      const list = await fetch("/api/oauth-config", { cache: "no-store" });
      onCreated(await list.json());
      setF(blank);
      setOpen(false);
      pushMsg("ok", "自定义登录方式已创建");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-5 py-4 text-sm text-zinc-300 hover:border-indigo-500 hover:text-indigo-300"
      >
        <Plus size={15} /> 添加自定义 OAuth2 登录方式
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-indigo-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-100">添加自定义 OAuth2 提供商</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          标识用于回调 URL 与内部存储，创建后不可修改（小写字母、数字、短横线）。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
        <Field label="标识 slug *">
          <input className={inputCls} value={f.slug} onChange={set("slug")} placeholder="如 gitlab" />
        </Field>
        <Field label="显示名称 *">
          <input className={inputCls} value={f.label} onChange={set("label")} placeholder="如 GitLab" />
        </Field>
        <Field label="授权地址 *">
          <input className={inputCls} value={f.authorizeUrl} onChange={set("authorizeUrl")} />
        </Field>
        <Field label="令牌地址 *">
          <input className={inputCls} value={f.tokenUrl} onChange={set("tokenUrl")} />
        </Field>
        <Field label="用户信息地址 *">
          <input className={inputCls} value={f.userInfoUrl} onChange={set("userInfoUrl")} />
        </Field>
        <Field label="唯一 ID 字段 *">
          <input
            className={inputCls}
            value={f.openIdField}
            onChange={set("openIdField")}
            placeholder="id / sub / data.id"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          创建
        </button>
      </div>
    </div>
  );
}

export default function OAuthAdmin() {
  const [providers, setProviders] = useState<AdminProvider[] | null>(null);
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/oauth-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProviders(Array.isArray(d) ? d : []))
      .catch(() => setProviders([]));
  }, []);

  const pushMsg = (kind: "ok" | "err", text: string) => setMsg({ kind, text });

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Share2 size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">第三方登录</h1>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
        在各开放平台创建应用后，把对应提供商卡片中的「回调地址」填入平台的授权回调域；
        再填写客户端 ID / 密钥并启用。一个账号可绑定多种登录方式；仅当提供商返回
        <span className="text-zinc-200">已验证邮箱</span>时才会按邮箱合并到已有账号。
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
            msg.kind === "ok"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-red-800 bg-red-950/40 text-red-300"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {providers === null ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> 正在加载…
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {providers.map((p) => (
              <ProviderCard
                key={p.key}
                provider={p}
                origin={origin}
                onSaved={setProviders}
                onDeleted={setProviders}
                pushMsg={pushMsg}
              />
            ))}
          </div>
          <AddCustomCard onCreated={setProviders} pushMsg={pushMsg} />
        </>
      )}
    </div>
  );
}
