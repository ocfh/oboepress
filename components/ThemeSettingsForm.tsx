"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  LayoutGrid,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { SectionFields } from "@/components/SettingsFields";
import type { SettingsSchema } from "@/lib/settings-schema";
import { themeToVars } from "@/lib/theme";
import { getPalettePreset, paletteLayeredConfig } from "@/lib/theme-palettes";
import type { ThemeConfig } from "@/db/schema";

/**
 * Per-theme options panel.
 *
 * Two schemas are stitched into one navigation: the universal appearance
 * sections (design tokens) and the theme's own sections from manifest.json.
 * Values live in a single flat draft — the API splits them back into
 * `themes.config` vs `themes.settings` on save.
 */

type Props = {
  slug: string;
  name: string;
  version: string;
  author: string;
  description: string;
  isActive: boolean;
  hasManifest: boolean;
  appearanceSchema: SettingsSchema;
  settingsSchema: SettingsSchema;
  widgetAreas: { key: string; label: string; description?: string }[];
  initialConfig: Record<string, unknown>;
  initialSettings: Record<string, unknown>;
  /** 出厂默认 + manifest 的基线值 —— 与基线同值的令牌不算用户微调。 */
  baselineConfig: Record<string, unknown>;
};

export default function ThemeSettingsForm(props: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, unknown>>({
    ...props.initialConfig,
    ...props.initialSettings,
  });
  const [active, setActive] = useState(
    props.appearanceSchema[0]?.key ?? props.settingsSchema[0]?.key ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const all = useMemo(
    () => [...props.appearanceSchema, ...props.settingsSchema],
    [props.appearanceSchema, props.settingsSchema],
  );
  const section = all.find((s) => s.key === active) ?? all[0];

  // Live preview swatch: only the token keys are meaningful as CSS vars.
  // The theme's 配色方案 is layered underneath so picking a palette repaints
  // the preview instantly, exactly like the public site does.
  const previewVars = useMemo(() => {
    const cfg: Record<string, string> = {};
    for (const s of props.appearanceSchema) {
      for (const f of s.fields) {
        const v = draft[f.key];
        if (typeof v === "string" && v.trim()) cfg[f.key] = v;
      }
    }
    // Same layering as the public render path (baseline → 配色方案 → 微调)，
    // otherwise every untouched token would pin the palette here too.
    return themeToVars(
      paletteLayeredConfig(
        cfg as ThemeConfig,
        props.baselineConfig as Partial<ThemeConfig>,
        typeof draft.palette === "string" ? draft.palette : undefined,
      ),
    );
  }, [draft, props.appearanceSchema, props.baselineConfig]);

  function set(key: string, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value }));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/themes/${props.slug}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("已保存，刷新前台即可看到效果");
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setMsg(json.error ?? "保存失败");
    }
  }

  async function reset() {
    if (!confirm("恢复为主题自带的默认配置？当前的自定义修改会丢失。")) return;
    setSaving(true);
    const res = await fetch(`/api/themes/${props.slug}/settings`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok && json.config) {
      setDraft({ ...json.config, ...json.settings });
      setMsg("已恢复主题默认值");
      router.refresh();
    }
  }

  const navGroup = (label: string, sections: SettingsSchema) =>
    sections.length > 0 && (
      <div>
        <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          {label}
        </p>
        <div className="space-y-0.5">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                s.key === section?.key
                  ? "bg-indigo-600/15 text-indigo-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/themes"
            className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-indigo-400"
          >
            <ArrowLeft size={12} /> 返回主题列表
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
            {props.name}
            {props.isActive && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                已启用
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{props.description}</p>
          <p className="mt-1 font-mono text-[11px] text-zinc-600">
            themes/{props.slug} · v{props.version}
            {props.author ? ` · ${props.author}` : ""}
            {!props.hasManifest && " · 自定义主题（无 manifest）"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition hover:border-amber-500 hover:text-amber-400 disabled:opacity-50"
          >
            <RotateCcw size={13} /> 恢复默认
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-5 flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 size={14} /> {msg}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="space-y-4">
          {navGroup("外观", props.appearanceSchema)}
          {navGroup("主题选项", props.settingsSchema)}

          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
              <LayoutGrid size={12} className="text-indigo-400" /> 小工具区域
            </p>
            <ul className="space-y-1">
              {props.widgetAreas.map((a) => (
                <li key={a.key} className="text-[11px] text-zinc-500">
                  <span className="text-zinc-400">{a.label}</span>
                  <code className="ml-1 text-zinc-600">{a.key}</code>
                </li>
              ))}
            </ul>
            <Link
              href="/admin/widgets"
              className="mt-2 inline-block text-[11px] text-indigo-400 transition hover:text-indigo-300"
            >
              去配置小工具 →
            </Link>
          </div>

          {/* Live token preview — cheap sanity check while tweaking colors. */}
          <div
            style={previewVars}
            className="overflow-hidden rounded-md border"
            // eslint-disable-next-line react/forbid-dom-props
          >
            <div
              style={{
                background: "var(--background)",
                borderColor: "var(--border)",
                color: "var(--text)",
                fontFamily: "var(--font)",
              }}
              className="p-3"
            >
              <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-60">
                <Sparkles size={10} /> 预览
              </p>
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  border: "var(--border-width) solid var(--border)",
                }}
                className="p-2.5"
              >
                <p className="text-xs font-semibold">标题文字</p>
                <p style={{ color: "var(--muted)" }} className="mt-0.5 text-[10px]">
                  次要说明文字
                </p>
                <span
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-text)",
                    borderRadius: "var(--radius)",
                  }}
                  className="mt-2 inline-block px-2 py-0.5 text-[10px]"
                >
                  按钮
                </span>
              </div>
            </div>
          </div>
        </nav>

        <div>
          {section ? (
            <>
              <h2 className="mb-1 text-sm font-semibold text-zinc-200">
                {section.label}
              </h2>
              {section.description && (
                <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                  {section.description}
                </p>
              )}
              <SectionFields section={section} values={draft} onChange={set} />
            </>
          ) : (
            <p className="text-sm text-zinc-500">该主题没有声明可配置项。</p>
          )}
        </div>
      </div>
    </div>
  );
}
