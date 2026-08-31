"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  isFieldVisible,
  type SettingField,
  type SettingSection,
} from "@/lib/settings-schema";

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
      return (
        <div className="col-span-2">
          {label}
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
              <input
                id={id}
                value={String(value ?? "")}
                placeholder={field.placeholder ?? "/uploads/media/... 或 https://..."}
                onChange={(e) => onChange(e.target.value)}
                className={inputCls}
              />
              {help}
            </div>
          </div>
        </div>
      );

    case "links":
      return <LinksField field={field} value={value} onChange={onChange} />;

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
        .filter((f) => isFieldVisible(f, values))
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
