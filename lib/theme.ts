import type { ThemeConfig } from "@/db/schema";

/**
 * 系统内置的出厂默认主题配置。任何自定义主题都可以通过"恢复默认"一键
 * 重置回这组数值，保证用户永远能回到干净状态。
 *
 * 每个键都会被序列化成一个 CSS 自定义属性挂到 :root 上，主题样式表直接
 * 用 var(--xxx) 消费 —— 所以「换肤」不需要改一行代码。
 */
export const DEFAULT_THEME_CONFIG: Required<ThemeConfig> = {
  // Palette
  background: "#09090b",
  surface: "#18181b",
  surfaceAlt: "#1f1f23",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  accent: "#818cf8",
  accentText: "#ffffff",
  accentSoft: "rgba(129,140,248,0.16)",
  border: "#27272a",
  link: "#a5b4fc",
  linkHover: "#c7d2fe",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  headerBg: "rgba(9,9,11,0.72)",
  footerBg: "#0c0c0f",
  codeBg: "#111114",

  // Shape & motion
  radius: "12px",
  radiusLarge: "22px",
  borderWidth: "1px",
  shadow: "0 10px 30px rgba(0,0,0,0.35)",
  transition: "200ms cubic-bezier(0.4,0,0.2,1)",

  // Typography
  font: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontHeading: "inherit",
  fontMono:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: "16px",
  lineHeight: "1.75",
  letterSpacing: "0em",
  headingWeight: "700",

  // Layout
  containerWidth: "1200px",
  contentWidth: "760px",
  sidebar: "none",
  density: "normal",
  listStyle: "list",
  gridColumns: "3",
  headerMode: "sticky",

  // Effects
  glass: "off",
  glassBlur: "14px",
  noise: "off",
  gradient: "linear-gradient(135deg,#818cf8,#c084fc)",

  // Escape hatch
  customCss: "",
};

const FALLBACK = DEFAULT_THEME_CONFIG;

/** camelCase token key -> CSS custom property name (`accentText` -> `--accent-text`). */
export function tokenToCssVar(key: string): string {
  return `--${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Keys that are behavioural flags, not CSS values — excluded from the var block. */
const NON_CSS_KEYS = new Set<keyof ThemeConfig>(["customCss"]);

function merged(config: ThemeConfig | null | undefined): Required<ThemeConfig> {
  // Drop empty strings so a blank field falls back to the default instead of
  // emitting `--accent:;` and breaking the whole declaration block.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(config ?? {})) {
    if (typeof v === "string" && v.trim() !== "") clean[k] = v;
  }
  return { ...FALLBACK, ...clean } as Required<ThemeConfig>;
}

/**
 * Serialize a theme config into CSS custom properties for injection on :root.
 * Legacy aliases (`--bg`, `--accent-text`) are kept so existing themes and
 * globals.css keep working after the token set grew.
 */
export function themeToCss(config: ThemeConfig | null | undefined): string {
  const c = merged(config);
  const decls: string[] = [];
  for (const [key, value] of Object.entries(c)) {
    if (NON_CSS_KEYS.has(key as keyof ThemeConfig)) continue;
    decls.push(`${tokenToCssVar(key)}:${value}`);
  }
  // Legacy alias used throughout globals.css and the shipped themes.
  decls.push(`--bg:${c.background}`);
  return decls.join(";");
}

export function themeToVars(
  config: ThemeConfig | null | undefined,
): React.CSSProperties {
  const c = merged(config);
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(c)) {
    if (NON_CSS_KEYS.has(key as keyof ThemeConfig)) continue;
    style[tokenToCssVar(key)] = value;
  }
  style["--bg"] = c.background;
  return style as React.CSSProperties;
}

/** Resolve the effective config (defaults + overrides) for server-side logic. */
export function resolveThemeConfig(
  config: ThemeConfig | null | undefined,
): Required<ThemeConfig> {
  return merged(config);
}

/** Helper for themes: read a boolean-ish token ("on"/"off"/"true"/"1"). */
export function isOn(value: string | undefined | null): boolean {
  if (!value) return false;
  return ["on", "true", "1", "yes", "enabled"].includes(value.toLowerCase());
}
