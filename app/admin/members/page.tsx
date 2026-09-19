"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  UserPlus,
  TriangleAlert,
} from "lucide-react";

type DefaultRole = "subscriber" | "author";

type MemberCfg = {
  registerEnabled: boolean;
  registerPath: string;
  emailRequired: boolean;
  phoneRequired: boolean;
  captchaEnabled: boolean;
  inviteOnly: boolean;
  inviteCodes: string[];
  defaultRole: DefaultRole;
};

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500";

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

export default function MembersAdmin() {
  const [cfg, setCfg] = useState<MemberCfg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/members", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => setLoadError(true));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) {
      setCfg(await res.json());
      setMsg({ kind: "ok", text: "会员注册设置已保存并立即生效" });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error ?? "保存失败" });
    }
  }

  if (loadError) {
    return <p className="text-sm text-rose-400">会员设置加载失败，请刷新重试。</p>;
  }
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
          <UserPlus size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">会员注册</h1>
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">开放注册</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后访客可在前台注册页自行注册账号，注册成功即自动登录；
              关闭后注册页与注册接口一律返回 404，不暴露任何注册信息。
            </p>
          </div>
          <Toggle
            checked={cfg.registerEnabled}
            onChange={(v) => setCfg({ ...cfg, registerEnabled: v })}
          />
        </div>

        {cfg.registerEnabled && (
          <div className="mt-5">
            <label className="mb-1 block text-sm font-medium text-zinc-200">
              注册页路径
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">/</span>
              <input
                className={inputCls}
                value={cfg.registerPath.replace(/^\//, "")}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    registerPath: "/" + e.target.value.replace(/^\/+/, ""),
                  })
                }
                placeholder="user"
                spellCheck={false}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              仅允许小写字母、数字、-、_，可用 / 分层（最多 3 层），总长度 ≤ 64；
              不能与伪装登录入口相同。
            </p>
            {origin && (
              <p className="mt-2 break-all rounded-md bg-zinc-950 px-3 py-2 font-mono text-xs text-indigo-300">
                {origin}
                {cfg.registerPath || "/user"}
              </p>
            )}
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs leading-5 text-amber-300">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>
                若与已发布文章 / 页面地址相同，内容页面优先，注册页将无法打开；
                站点导航中可通过「菜单管理」添加指向该地址的链接供访客进入。
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">邮箱必填</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后注册必须填写邮箱；关闭后邮箱为选填，会员仍可在个人资料中补填。
            </p>
          </div>
          <Toggle
            checked={cfg.emailRequired}
            onChange={(v) => setCfg({ ...cfg, emailRequired: v })}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">手机号必填</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后注册必须填写手机号（支持大陆 11 位与 + 开头的国际号码）；
              关闭后手机号为选填，仍可填写并占用唯一账号绑定。
            </p>
          </div>
          <Toggle
            checked={cfg.phoneRequired}
            onChange={(v) => setCfg({ ...cfg, phoneRequired: v })}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">注册验证码</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后注册必须先通过验证码校验。验证码方式（内置图形 / 自定义
              校验接口）复用
              <Link href="/admin/security" className="text-indigo-400 hover:underline">
                后台安全
              </Link>
              中的同一套通道配置。
            </p>
          </div>
          <Toggle
            checked={cfg.captchaEnabled}
            onChange={(v) => setCfg({ ...cfg, captchaEnabled: v })}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">邀请码注册</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              开启后注册必须填写有效邀请码。在下方每行填写一个邀请码，
              校验时忽略大小写；保存时自动去重。
            </p>
          </div>
          <Toggle
            checked={cfg.inviteOnly}
            onChange={(v) => setCfg({ ...cfg, inviteOnly: v })}
          />
        </div>
        {cfg.inviteOnly && (
          <div className="mt-4">
            <textarea
              className={inputCls}
              rows={6}
              spellCheck={false}
              value={cfg.inviteCodes.join("\n")}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  inviteCodes: e.target.value.split("\n"),
                })
              }
              placeholder={"WELCOME-2026\nOBEO-PRESS"}
            />
            <p className="mt-1 text-xs text-zinc-500">
              当前 {cfg.inviteCodes.map((c) => c.trim()).filter(Boolean).length} 个邀请码，
              单个最长 64 个字符，最多 200 个。
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">新用户默认角色</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          注册会员的初始权限角色，之后可在「用户」中逐个调整。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              { v: "subscriber", t: "订阅者", d: "仅具备前台基础阅读权限" },
              { v: "author", t: "作者", d: "可撰写并管理自己的内容" },
            ] as { v: DefaultRole; t: string; d: string }[]
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setCfg({ ...cfg, defaultRole: opt.v })}
              className={`rounded-md border px-3 py-2 text-left transition ${
                cfg.defaultRole === opt.v
                  ? "border-indigo-500 bg-indigo-950/40"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <span className="block text-xs font-medium text-zinc-100">{opt.t}</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">{opt.d}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
