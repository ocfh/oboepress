"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PanelLeft,
  Home,
  Check,
  Loader2,
  Save,
  Plug,
  Lock,
} from "lucide-react";
import type { AdminMenuGroup, AdminMenuLeaf } from "@/lib/admin-menu";

export default function MenuSettings({
  groups,
  hiddenHrefs,
  homePath,
}: {
  groups: AdminMenuGroup[];
  hiddenHrefs: string[];
  homePath: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>(hiddenHrefs);
  const [home, setHome] = useState(homePath);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const toggle = (leaf: AdminMenuLeaf) => {
    if (leaf.locked || home === leaf.href) return;
    setMsg(null);
    setHidden((cur) =>
      cur.includes(leaf.href)
        ? cur.filter((h) => h !== leaf.href)
        : [...cur, leaf.href],
    );
  };

  const chooseHome = (leaf: AdminMenuLeaf) => {
    if (leaf.hook || leaf.external || leaf.locked) return;
    setMsg(null);
    setHome(leaf.href);
    // 成为首页的项强制可见。
    setHidden((cur) => cur.filter((h) => h !== leaf.href));
  };

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/menu-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenHrefs: hidden, homePath: home }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error || "保存失败" });
        return;
      }
      setHidden(data.hiddenHrefs ?? []);
      setMsg({ kind: "ok", text: "已保存，侧栏菜单已更新" });
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: "网络异常，请稍后再试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <PanelLeft size={22} />
        </span>
        <h1 className="text-2xl font-bold">菜单与首页</h1>
      </div>
      <p className="mt-3 text-sm text-zinc-400">
        取消勾选可隐藏对应二级菜单；右侧「设为首页」决定进入后台时默认打开的页面。当前首页与系统锁定项不可隐藏；插件、主题提供的菜单仅支持显隐，不能设为首页。
      </p>

      <div className="mt-6 space-y-4">
        {groups.map((group) => (
          <section
            key={group.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900"
          >
            <header className="border-b border-zinc-800 px-5 py-3">
              <h2 className="text-sm font-semibold text-zinc-200">
                {group.label}
              </h2>
            </header>
            <ul className="divide-y divide-zinc-800/70">
              {group.children.map((leaf) => {
                const isHome = home === leaf.href;
                const isHidden = hidden.includes(leaf.href);
                const boxDisabled = leaf.locked || isHome;
                const canHome = !leaf.hook && !leaf.external && !leaf.locked;
                return (
                  <li
                    key={leaf.href}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      disabled={boxDisabled}
                      onChange={() => toggle(leaf)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        isHidden ? "text-zinc-500" : "text-zinc-200"
                      }`}
                    >
                      {leaf.label}
                    </span>
                    {leaf.hook && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                        <Plug size={10} />
                        扩展
                      </span>
                    )}
                    {leaf.locked && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                        <Lock size={10} />
                        锁定
                      </span>
                    )}
                    <span className="w-24 shrink-0 text-right">
                      {isHome ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
                          <Home size={11} />
                          当前首页
                        </span>
                      ) : canHome ? (
                        <button
                          type="button"
                          onClick={() => chooseHome(leaf)}
                          className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-indigo-500 hover:text-indigo-300"
                        >
                          <Home size={11} />
                          设为首页
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/95 px-5 py-3 backdrop-blur">
        <span className="text-sm">
          {msg?.kind === "ok" && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Check size={14} />
              {msg.text}
            </span>
          )}
          {msg?.kind === "err" && <span className="text-red-400">{msg.text}</span>}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          保存设置
        </button>
      </div>
    </div>
  );
}
