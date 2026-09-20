"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  isFieldVisible,
  type SettingField,
  type SettingSection,
} from "@/lib/settings-schema";
import IconPicker from "./admin/IconPicker";

/**
 * Generic, schema-driven settings renderer.
 *
 * Both plugins and themes declare their options as a `SettingsSchema`; this
 * component turns that data into a full admin form. Adding a new option to a
 * theme is therefore a one-line JSON change — no React required.
 */

export type Values = Record<string, unknown>;

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-500";

export function Field({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `f-${field.key}`;

  if (field.type === "group") {
    return (
      <div className="col-span-2 mt-2 border-t border-zinc-800 pt-4">
        <p className="text-sm font-semibold text-zinc-200">{field.label}</p>
        {field.help && <p className="mt-1 text-xs text-zinc-500">{field.help}</p>}
      </div>
    );
  }

  const label = (
    <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-zinc-400">
      {field.label}
    </label>
  );
  const help = field.help ? (
    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{field.help}</p>
  ) : null;

  switch (field.type) {
    case "switch":
      return (
        <div className={field.half ? "" : "col-span-2"}>
          <button
            type="button"
            onClick={() => onChange(!value)}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-left transition hover:border-zinc-600"
          >
            <span className="text-sm text-zinc-200">{field.label}</span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                value ? "bg-indigo-600" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  value ? "left-[18px]" : "left-0.5"
                }`}
              />
            </span>
          </button>
          {help}
        </div>
      );

    case "color":
      return (
        <div className={field.half ? "" : "col-span-2"}>
          {label}
          <div className="flex items-center gap-2">
            <input
              type="color"
              // <input type=color> only accepts #rrggbb — fall back for rgba()/gradients.
              value={/^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 w-10 shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-900"
            />
            <input
              id={id}
              value={String(value ?? "")}
              placeholder={field.placeholder ?? "#000000 / rgba() / gradient"}
              onChange={(e) => onChange(e.target.value)}
              className={inputCls + " font-mono text-xs"}
            />
          </div>
          {help}
        </div>
      );

    case "select":
      return (
        <div className={field.half ? "" : "col-span-2"}>
          {label}
          <div className="relative">
            <select
              id={id}
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
              className={inputCls + " appearance-none pr-8"}
            >
              {(field.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
          </div>
          {help}
        </div>
      );

    case "range":
      return (
        <div className={field.half ? "" : "col-span-2"}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">{field.label}</span>
            <span className="font-mono text-xs text-indigo-400">
              {String(value ?? field.default ?? 0)}
              {field.unit ?? ""}
            </span>
          </div>
          <input
            id={id}
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={Number(value ?? field.default ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          {help}
        </div>
      );

    case "number":
      return (
        <div className={field.half ? "" : "col-span-2"}>
          {label}
          <input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value ?? field.default ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className={inputCls}
          />
          {help}
        </div>
      );

    case "textarea":
    case "code":
      return (
        <div className="col-span-2">
          {label}
          <textarea
            id={id}
            rows={field.type === "code" ? 8 : 3}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={
              inputCls + (field.type === "code" ? " font-mono text-xs leading-relaxed" : "")
            }
          />
          {help}
        </div>
      );

    case "image":
      return <ImageField field={field} value={value} onChange={onChange} />;

    case "links":
      return <LinksField field={field} value={value} onChange={onChange} />;

    case "footerLinks":
      return <FooterLinksField field={field} value={value} onChange={onChange} />;

    case "categoryRows":
      return <CategoryRowsField field={field} value={value} onChange={onChange} />;

    case "verifications":
      return <VerificationsField field={field} value={value} onChange={onChange} />;

    case "font":
      return (
        <div className="col-span-2">
          {label}
          <input
            id={id}
            value={String(value ?? "")}
            placeholder={field.placeholder ?? "字体栈，如 'Inter', sans-serif"}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls + " font-mono text-xs"}
            style={{ fontFamily: String(value || "inherit") }}
          />
          {help}
        </div>
      );

    default:
      return (
        <div className={field.half ? "" : "col-span-2"}>
          {label}
          <input
            id={id}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
          />
          {help}
        </div>
      );
  }
}

function ImageField({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const id = `f-${field.key}`;

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: fd });
      const row = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(row.error || "上传失败");
      } else {
        onChange(row.url || row.path || row.src || "");
      }
    } catch {
      setErr("上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col-span-2">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-zinc-400">
        {field.label}
      </label>
      <div className="flex items-start gap-3">
        {String(value ?? "") && (
          // Arbitrary user URLs — plain <img> avoids next/image domain config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={String(value)}
            alt=""
            className="h-16 w-16 shrink-0 rounded-md border border-zinc-700 object-cover"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <input
              id={id}
              value={String(value ?? "")}
              placeholder={field.placeholder ?? "/uploads/media/... 或 https://..."}
              onChange={(e) => onChange(e.target.value)}
              className={inputCls}
            />
            <label className="relative shrink-0 cursor-pointer rounded-md border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-400">
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Upload size={14} /> 上传
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={upload}
                disabled={busy}
                className="sr-only"
              />
            </label>
          </div>
          {err && <p className="mt-1 text-[11px] text-rose-400">{err}</p>}
          {field.help ? (
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{field.help}</p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              可直接粘贴 URL，或点「上传」从本机选择图片。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LinksField({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const items = Array.isArray(value)
    ? (value as { label?: string; url?: string; icon?: string }[])
    : [];
  const update = (i: number, patch: Partial<{ label: string; url: string; icon: string }>) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    onChange(next);
  };
  return (
    <div className="col-span-2">
      <p className="mb-1.5 text-xs font-medium text-zinc-400">{field.label}</p>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={it.label ?? ""}
              placeholder="名称"
              onChange={(e) => update(i, { label: e.target.value })}
              className={inputCls + " w-28 shrink-0"}
            />
            <input
              value={it.url ?? ""}
              placeholder="https://"
              onChange={(e) => update(i, { url: e.target.value })}
              className={inputCls}
            />
            <input
              value={it.icon ?? ""}
              placeholder="图标"
              onChange={(e) => update(i, { icon: e.target.value })}
              className={inputCls + " w-24 shrink-0"}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-md border border-zinc-700 p-2 text-zinc-400 transition hover:border-rose-500 hover:text-rose-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, { label: "", url: "", icon: "" }])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-400"
      >
        <Plus size={13} /> 添加一项
      </button>
      {field.help && <p className="mt-1 text-[11px] text-zinc-500">{field.help}</p>}
    </div>
  );
}

/**
 * Repeatable editor for the footer_links field:
 * each row is link text (HTML allowed), URL, and an optional 16px icon URL.
 */
function FooterLinksField({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const items = Array.isArray(value)
    ? (value as { text?: string; url?: string; image?: string }[])
    : [];
  const update = (i: number, patch: Partial<{ text: string; url: string; image: string }>) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    onChange(next);
  };
  return (
    <div className="col-span-2">
      <p className="mb-1.5 text-xs font-medium text-zinc-400">{field.label}</p>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={it.text ?? ""}
              placeholder="文字（支持 HTML）"
              onChange={(e) => update(i, { text: e.target.value })}
              className={inputCls + " w-44 shrink-0"}
            />
            <input
              value={it.url ?? ""}
              placeholder="https://"
              onChange={(e) => update(i, { url: e.target.value })}
              className={inputCls}
            />
            <input
              value={it.image ?? ""}
              placeholder="图标 URL（可选）"
              onChange={(e) => update(i, { image: e.target.value })}
              className={inputCls + " w-44 shrink-0"}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-md border border-zinc-700 p-2 text-zinc-400 transition hover:border-rose-500 hover:text-rose-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, { text: "", url: "", image: "" }])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-400"
      >
        <Plus size={13} /> 添加一项
      </button>
      {field.help && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{field.help}</p>}
    </div>
  );
}

/**
 * Repeatable homepage category-section editor: each row picks a category,
 * an optional title override, and an optional lucide icon (shown at the
 * section title); rows can be reordered (render order on the homepage
 * follows the list order). Categories load from the public API.
 */
function CategoryRowsField({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [cats, setCats] = useState<{ id: number; name: string; slug: string }[] | null>(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("分类加载失败"))))
      .then((data) => {
        if (!alive) return;
        setCats(Array.isArray(data) ? data : []);
      })
      .catch((e: Error) => {
        if (alive) setLoadErr(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows: { slug?: string; title?: string; icon?: string | null }[] = Array.isArray(value) ? value : [];

  const update = (i: number, patch: Partial<{ slug: string; title: string; icon: string | null }>) => {
    onChange(rows.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const used = new Set(rows.map((r) => r.slug));
    const first = (cats ?? []).find((c) => !used.has(c.slug));
    onChange([...rows, { slug: first?.slug ?? "", title: "", icon: null }]);
  };

  const iconBtn =
    "shrink-0 rounded-md border border-zinc-700 p-2 text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-400 disabled:opacity-30 disabled:hover:border-zinc-700 disabled:hover:text-zinc-400";

  return (
    <div className="col-span-2">
      <p className="mb-1.5 text-xs font-medium text-zinc-400">{field.label}</p>
      <div className="space-y-2">
        {rows.map((it, i) => {
          const missing = !!it.slug && cats && !cats.some((c) => c.slug === it.slug);
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  title="上移"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className={`${iconBtn} !p-1`}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  title="下移"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  className={`${iconBtn} !p-1`}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
              <div className="relative flex-1">
                <select
                  value={it.slug ?? ""}
                  onChange={(e) => update(i, { slug: e.target.value })}
                  className={inputCls + " appearance-none pr-8" + (missing ? " border-rose-600" : "")}
                >
                  <option value="">— 选择分类 —</option>
                  {(cats ?? []).map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                  {missing && <option value={it.slug}>{it.slug}（已删除）</option>}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                />
              </div>
              <input
                value={it.title ?? ""}
                placeholder="标题留空则用分类名"
                onChange={(e) => update(i, { title: e.target.value })}
                className={inputCls + " w-44 shrink-0"}
              />
              <div title="区块标题图标（留空显示默认彩条）" className="shrink-0">
                <IconPicker
                  compact
                  value={it.icon ?? null}
                  onChange={(icon) => update(i, { icon })}
                />
              </div>
              <button
                type="button"
                title="删除此区块"
                onClick={() => remove(i)}
                className="shrink-0 rounded-md border border-zinc-700 p-2 text-zinc-400 transition hover:border-rose-500 hover:text-rose-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="rounded-md border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-500">
            还没有分类区块，点下方按钮添加。
          </p>
        )}
      </div>
      {cats === null && !loadErr && (
        <p className="mt-2 text-[11px] text-zinc-500">正在加载分类…</p>
      )}
      {loadErr && <p className="mt-2 text-[11px] text-rose-400">{loadErr}</p>}
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-indigo-500 hover:text-indigo-400"
      >
        <Plus size={13} /> 添加分类区块
      </button>
      {field.help && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{field.help}</p>}
    </div>
  );
}

/**
 * Webmaster verification codes (Google Search Console / Yandex / Bing / Yahoo).
 * Stored as the single `verifications` jsonb object; emitted as <meta> tags.
 */
function VerificationsField({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const map = value && typeof value === "object" ? (value as Record<string, string>) : {};
  const providers = [
    { key: "google", label: "Google", placeholder: "google-site-verification 内容" },
    { key: "yandex", label: "Yandex", placeholder: "yandex-verification 内容" },
    { key: "bing", label: "Bing", placeholder: "msvalidate.01 内容" },
    { key: "yahoo", label: "Yahoo", placeholder: "y_key 内容" },
  ];
  return (
    <div className="col-span-2">
      <p className="mb-1.5 text-xs font-medium text-zinc-400">{field.label}</p>
      <div className="grid grid-cols-2 gap-2">
        {providers.map((p) => (
          <div key={p.key}>
            <input
              value={map[p.key] ?? ""}
              placeholder={`${p.label}：${p.placeholder}`}
              onChange={(e) => onChange({ ...map, [p.key]: e.target.value })}
              className={inputCls}
            />
          </div>
        ))}
      </div>
      {field.help && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{field.help}</p>}
    </div>
  );
}

/** Render one section's grid of fields. */
export function SectionFields({
  section,
  values,
  onChange,
}: {
  section: SettingSection;
  values: Values;
  onChange: (key: string, v: unknown) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {section.fields
        .filter((f) => f.type !== "hidden" && isFieldVisible(f, values))
        .map((f) => (
          <Field
            key={f.key}
            field={f}
            value={values[f.key]}
            onChange={(v) => onChange(f.key, v)}
          />
        ))}
    </div>
  );
}

/** Tabbed form for a whole schema. Returns nothing — parent owns the values. */
export function SchemaForm({
  schema,
  values,
  onChange,
}: {
  schema: SettingSection[];
  values: Values;
  onChange: (key: string, v: unknown) => void;
}) {
  const [active, setActive] = useState(schema[0]?.key ?? "");
  if (!schema.length) {
    return <p className="text-sm text-zinc-500">该项目没有声明可配置项。</p>;
  }
  const section = schema.find((s) => s.key === active) ?? schema[0];
  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <nav className="space-y-1">
        {schema.map((s) => (
          <button
            key={s.key}
            type="button"
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
      <div>
        {section.description && (
          <p className="mb-4 text-xs leading-relaxed text-zinc-500">
            {section.description}
          </p>
        )}
        <SectionFields section={section} values={values} onChange={onChange} />
      </div>
    </div>
  );
}
