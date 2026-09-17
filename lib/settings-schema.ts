/**
 * 声明式设置 schema，插件与主题共用：选项声明为数据，admin 用一个通用
 * 渲染器自动生成表单，移植的主题也能暴露任意多选项而无需写 React。
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "range"
  | "color"
  | "select"
  | "switch"
  | "image"
  | "code"
  | "font"
  | "links" // repeatable {label,url} list
  | "footerLinks" // repeatable {text,url,image?} list — footer links
  | "categoryRows" // repeatable {slug,title} list — homepage category sections
  | "group"; // visual sub-heading, no value

/** One row of a `categoryRows` field: a category plus optional title override. */
export interface CategoryRow {
  slug: string;
  title: string;
}

export interface SettingField {
  key: string;
  label: string;
  type: FieldType;
  /** Help text rendered under the control. */
  help?: string;
  default?: unknown;
  placeholder?: string;
  /** select options */
  options?: { value: string; label: string }[];
  /** number / range bounds */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Show this field only when another field equals one of these values. */
  showIf?: { key: string; equals: string | string[] };
  /** Render two fields side by side. */
  half?: boolean;
}

export interface SettingSection {
  key: string;
  label: string;
  description?: string;
  /** lucide-react icon name, e.g. "Palette". */
  icon?: string;
  fields: SettingField[];
}

export type SettingsSchema = SettingSection[];

function schemaDefaults(schema: SettingsSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of schema) {
    for (const field of section.fields) {
      if (field.type === "group") continue;
      if (field.default !== undefined) out[field.key] = field.default;
    }
  }
  return out;
}

/** Merge stored values over schema defaults, dropping unknown keys. */
export function resolveSettings(
  schema: SettingsSchema,
  stored: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const defaults = schemaDefaults(schema);
  const known = new Set(Object.keys(defaults));
  for (const s of schema) for (const f of s.fields) known.add(f.key);
  const out = { ...defaults };
  for (const [k, v] of Object.entries(stored ?? {})) {
    if (known.has(k) && v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

/** Coerce a raw form value to the type declared by the field. */
export function coerceField(field: SettingField, raw: unknown): unknown {
  switch (field.type) {
    case "number":
    case "range": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : (field.default ?? 0);
    }
    case "switch":
      return raw === true || raw === "true" || raw === "on" || raw === 1;
    case "links":
      return Array.isArray(raw) ? raw : [];
    case "footerLinks":
      return Array.isArray(raw)
        ? raw
            .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
            .map((r) => ({
              text: String(r.text ?? ""),
              url: String(r.url ?? ""),
              image: r.image ? String(r.image) : undefined,
            }))
        : [];
    case "categoryRows":
      return Array.isArray(raw)
        ? raw
            .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
            .map((r) => ({
              slug: String(r.slug ?? ""),
              title: String(r.title ?? ""),
            }))
        : [];
    default:
      return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
}

/** Validate + normalise a whole payload against a schema. */
export function coerceSettings(
  schema: SettingsSchema,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of schema) {
    for (const field of section.fields) {
      if (field.type === "group") continue;
      if (!(field.key in payload)) continue;
      out[field.key] = coerceField(field, payload[field.key]);
    }
  }
  return out;
}

/** Whether a field should be visible given the current values. */
export function isFieldVisible(
  field: SettingField,
  values: Record<string, unknown>,
): boolean {
  if (!field.showIf) return true;
  const current = String(values[field.showIf.key] ?? "");
  const expected = Array.isArray(field.showIf.equals)
    ? field.showIf.equals
    : [field.showIf.equals];
  return expected.map(String).includes(current);
}
