"use client";

import { useEffect, useState } from "react";
import { Unlink, Loader2 } from "lucide-react";
import OAuthButtons from "@/components/shared/OAuthButtons";
import type { PublicProvider } from "@/lib/services/oauth";

/**
 * 我的账号 → 第三方账号绑定卡。
 * 数据来自 GET /api/account/oauth：已绑身份、可绑提供商、nopassword 标记。
 * 纯第三方登录（nopassword）用户解绑最后一个身份会被服务端拒绝，
 * 这里同步给出「先设密码」提示。
 */
interface Identity {
  id: number;
  key: string;
  label: string;
  color: string;
  nickname: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
}

export default function OAuthBindings() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [passwordless, setPasswordless] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [oauthNew, setOauthNew] = useState(false);

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/account/oauth", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "加载失败");
      setIdentities(d.identities ?? []);
      setProviders(d.providers ?? []);
      setPasswordless(!!d.passwordless);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    setOauthNew(
      new URLSearchParams(window.location.search).get("oauth_new") === "1",
    );
    load();
  }, []);

  async function unbind(id: number) {
    if (!confirm("确定解绑该第三方账号吗？")) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/account/oauth", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityId: id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "解绑失败");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解绑失败");
    } finally {
      setBusyId(null);
    }
  }

  if (!loaded) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={14} className="animate-spin" /> 加载中…
      </p>
    );
  }

  // 已绑定的提供商不再出现在「绑定新账号」按钮里（同提供商换绑需先解绑）。
  const boundKeys = new Set(identities.map((i) => i.key));
  const bindable = providers.filter((p) => !boundKeys.has(p.key));

  return (
    <div className="space-y-4">
      {oauthNew && (
        <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          已通过第三方登录创建账号。建议在上方补充昵称与邮箱，并在「登录密码」卡片设置密码，以免后续无法登录。
        </p>
      )}
      {passwordless && (
        <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          当前账号尚未设置独立密码，只能通过第三方登录。请先设置密码，再解绑最后一个第三方账号。
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {identities.length === 0 ? (
        <p className="text-sm text-zinc-400">尚未绑定任何第三方账号。</p>
      ) : (
        <ul className="space-y-2">
          {identities.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
            >
              {it.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.avatarUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: it.color }}
                >
                  {it.label.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">
                  {it.label}
                  {it.nickname ? (
                    <span className="ml-2 text-zinc-400">{it.nickname}</span>
                  ) : null}
                </p>
                {it.lastLoginAt && (
                  <p className="text-xs text-zinc-500">
                    最近登录：
                    {new Date(it.lastLoginAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => unbind(it.id)}
                disabled={busyId === it.id}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-red-600 hover:text-red-400 disabled:opacity-50"
              >
                {busyId === it.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Unlink size={12} />
                )}
                解绑
              </button>
            </li>
          ))}
        </ul>
      )}

      {bindable.length > 0 && <OAuthButtons providers={bindable} bind />}
      {providers.length === 0 && identities.length === 0 && (
        <p className="text-xs text-zinc-500">
          站点尚未启用任何第三方登录提供商。
        </p>
      )}
    </div>
  );
}
