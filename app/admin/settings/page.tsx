"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Save, Settings } from "lucide-react";
import { SectionFields } from "@/components/SettingsFields";
import { resolveSettings, type SettingsSchema } from "@/lib/settings-schema";
import { SITE_SETTINGS_SCHEMA } from "@/lib/site-settings-schema";
import AccountPasswordForm from "@/components/AccountPasswordForm";

/**
 * Site settings — 常规 / 阅读 / SEO / 评论 / 代码注入.
 *
 * The whole form is generated from SITE_SETTINGS_SCHEMA; the only runtime work
 * here is injecting dynamic `select` options (installed themes, published pages)
 * before rendering.
 */
export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [themes, setThemes] = useState<{ slug: string; name: string }[]>([]);
  const [pages, setPages] = useState<{ id: number; title: string }[]>([]);
  const [active, setActive] = useState(SITE_SETTINGS_SCHEMA[0].key);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/themes", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/pages?limit=200", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({})),
    ])
      .then(([s, t, p]) => {
        setValues(resolveSettings(SITE_SETTINGS_SCHEMA, normalise(s)));
        setThemes(
          (t?.themes ?? t ?? []).map((th: { slug: string; name: string }) => ({
            slug: th.slug,
            name: th.name,
          })),
        );
        const list = p?.data ?? p?.pages ?? p?.items ?? (Array.isArray(p) ? p : []);
        setPages(
          (Array.isArray(list) ? list : []).map(
            (pg: { id: number; title: string }) => ({ id: pg.id, title: pg.title }),
          ),
        );
        setLoading(false);
      })
      .catch(() => {
        setMsg({ kind: "err", text: "加载设置失败" });
        setLoading(false);
      });
  }, []);

  /** Inject the runtime-known options into the declared schema. */
  const schema: SettingsSchema = useMemo(() => {
    const pageOptions = [
      { value: "", label: "— 未选择 —" },
      ...pages.map((p) => ({ value: String(p.id), label: p.title })),
    ];
    return SITE_SETTINGS_SCHEMA.map((section) => ({
      ...section,
      fields: section.fields.map((f) => {
        if (f.key === "activeThemeSlug") {
          return { ...f, options: themes.map((t) => ({ value: t.slug, label: t.name })) };
        }
        if (f.key === "homePageId" || f.key === "postsPageId") {
          return { ...f, options: pageOptions };
        }
        return f;
      }),
    }));
  }, [themes, pages]);

  const section = schema.find((s) => s.key === active) ?? schema[0];

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(denormalise(values)),
    });
    setSaving(false);
    if (res.ok) {
      const fresh = await res.json().catch(() => null);
      if (fresh) setValues(resolveSettings(SITE_SETTINGS_SCHEMA, normalise(fresh)));
      setMsg({ kind: "ok", text: "设置已保存" });
    } else {
      const json = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: json.error ?? "保存失败" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> 正在加载设置…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">站点设置</h1>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "保存中…" : "保存设置"}
        </button>
      </div>

      {msg && (
        <div
          className={`mb-5 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
            msg.kind === "ok"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-rose-800 bg-rose-950/40 text-rose-300"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <nav className="space-y-1">
          {schema.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                s.key === section.key
                  ? "bg-indigo-600/15 text-indigo-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="max-w-2xl">
          {section.description && (
            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              {section.description}
            </p>
          )}
          <SectionFields
            section={section}
            values={values}
            onChange={(k, v) => {
              setValues((prev) => ({ ...prev, [k]: v }));
              setMsg(null);
            }}
          />
        </div>
      </div>

      <div className="mt-10 border-t border-zinc-800 pt-8">
        <div className="max-w-2xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4">
            <KeyRound size={16} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">登录密码</h2>
          </div>
          <div className="px-5 py-5">
            <p className="mb-4 text-xs text-zinc-500">
              修改当前管理员账号的登录密码。需输入当前密码以确认身份。
            </p>
            <AccountPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}

/** DB row -> form values (ids become strings so `select` can match them). */
function normalise(row: Record<string, unknown> | null): Record<string, unknown> {
  if (!row) return {};
  const out = { ...row };
  for (const k of ["homePageId", "postsPageId"]) {
    out[k] = out[k] == null ? "" : String(out[k]);
  }
  return out;
}

/** Form values -> API payload (drop read-only columns, restore null ids). */
function denormalise(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const known = new Set(
    SITE_SETTINGS_SCHEMA.flatMap((s) =>
      s.fields.filter((f) => f.type !== "group").map((f) => f.key),
    ),
  );
  for (const [k, v] of Object.entries(values)) {
    if (!known.has(k)) continue;
    out[k] = v;
  }
  return out;
}
