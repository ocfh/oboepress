import type { ThemeConfig } from "@/db/schema";

/**
 * 内置配色方案（palette presets）。
 *
 * 一个主题 = 一套结构 + N 套色板。配色方案只覆盖 `ThemeConfig` 里的
 * 「颜色类」令牌（调色板 + 阴影/渐变），形状、排版、布局这些结构性令牌
 * 保持主题自身的选择不变 —— 这样切色板不会把版式也带跑。
 *
 * 取值来源：早期独立主题（THYUU / samsara / Writer / somnia / Vapor）
 * 的 manifest config，整合为同一主题下的可选项，避免为「换个颜色」而
 * 复制整个主题目录。
 */

/** 只覆盖颜色的那部分令牌。 */
export type PaletteTokens = Pick<
  ThemeConfig,
  | "background"
  | "surface"
  | "surfaceAlt"
  | "text"
  | "muted"
  | "accent"
  | "accentText"
  | "accentSoft"
  | "border"
  | "link"
  | "linkHover"
  | "headerBg"
  | "footerBg"
  | "codeBg"
  | "shadow"
  | "gradient"
  | "colorScheme"
>;

export interface PalettePreset {
  /** 存储在主题 settings 里的值。 */
  key: string;
  /** 后台下拉里显示的名称。 */
  label: string;
  /** 一句话说明，显示在设置项下方。 */
  description: string;
  /** 该方案是否为深色底 —— 供主题做明暗相关的渲染分支。 */
  dark: boolean;
  tokens: PaletteTokens;
}

/** 出厂默认：原 default 主题的深色靛蓝。 */
const INDIGO: PaletteTokens = {
  background: "#0b0d12",
  surface: "#161922",
  surfaceAlt: "#1b1f2a",
  text: "#e8eaf0",
  muted: "#9aa3b2",
  accent: "#7c8cff",
  accentText: "#0b0d12",
  accentSoft: "rgba(124,140,255,0.16)",
  border: "#262b36",
  link: "#a5b4fc",
  linkHover: "#c7d2fe",
  headerBg: "rgba(11,13,18,0.72)",
  footerBg: "#0c0f16",
  codeBg: "#11141c",
  shadow: "0 10px 30px rgba(0,0,0,0.35)",
  gradient: "linear-gradient(135deg,#7c8cff,#c084fc)",
  colorScheme: "dark",
};

/** THYUU / 星度：深色星空 + 暖金。 */
const THYUU: PaletteTokens = {
  background: "#171a21",
  surface: "rgba(255,255,255,0.06)",
  surfaceAlt: "rgba(255,255,255,0.04)",
  text: "rgba(255,255,255,0.9)",
  muted: "rgba(255,255,255,0.55)",
  accent: "#FFB020",
  accentText: "#1a1208",
  accentSoft: "rgba(255,176,32,0.16)",
  border: "rgba(255,255,255,0.1)",
  link: "#ffc44d",
  linkHover: "#ffe08a",
  headerBg: "rgba(15,17,22,0.7)",
  footerBg: "rgba(10,12,16,0.92)",
  codeBg: "rgba(255,255,255,0.06)",
  shadow: "0 10px 30px rgba(0,0,0,0.4)",
  gradient: "linear-gradient(135deg,#FFB020,#ffd98a)",
  colorScheme: "dark",
};

/** samsara：深炭玻璃 + 金。 */
const SAMSARA: PaletteTokens = {
  background: "#23272e",
  surface: "rgba(255,255,255,0.07)",
  surfaceAlt: "rgba(255,255,255,0.04)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.55)",
  accent: "#FFA000",
  accentText: "#1a1a1a",
  accentSoft: "rgba(255,160,0,0.16)",
  border: "rgba(255,255,255,0.12)",
  link: "#FFB020",
  linkHover: "#ffc94d",
  headerBg: "rgba(20,24,30,0.7)",
  footerBg: "rgba(15,18,23,0.92)",
  codeBg: "rgba(255,255,255,0.06)",
  shadow: "0 8px 24px rgba(0,0,0,0.35)",
  gradient: "linear-gradient(135deg,#FFA000,#ffd166)",
  colorScheme: "dark",
};

/** Writer：暖纸白 + 海军蓝，衬线阅读感。 */
const WRITER: PaletteTokens = {
  background: "#fbfaf7",
  surface: "#ffffff",
  surfaceAlt: "#f4f2ec",
  text: "#2b2b2b",
  muted: "#8a8a7a",
  accent: "#3256b3",
  accentText: "#ffffff",
  accentSoft: "rgba(50,86,179,0.12)",
  border: "#e6e2d8",
  link: "#3256b3",
  linkHover: "#22397d",
  headerBg: "rgba(251,250,247,0.86)",
  footerBg: "#f1efe9",
  codeBg: "#f4f2ec",
  shadow: "0 4px 16px rgba(40,40,30,0.06)",
  gradient: "linear-gradient(135deg,#3256b3,#5b7fd6)",
  colorScheme: "light",
};

/** somnia：近白 + 珊瑚。 */
const SOMNIA: PaletteTokens = {
  background: "#f6f6f7",
  surface: "#ffffff",
  surfaceAlt: "#f0f0f2",
  text: "#1f2430",
  muted: "#6b7280",
  accent: "#e26d6d",
  accentText: "#ffffff",
  accentSoft: "rgba(226,109,109,0.14)",
  border: "#e7e7ec",
  link: "#e26d6d",
  linkHover: "#c94f4f",
  headerBg: "rgba(255,255,255,0.82)",
  footerBg: "#f1f1f3",
  codeBg: "#f3f3f5",
  shadow: "0 6px 22px rgba(20,20,40,0.08)",
  gradient: "linear-gradient(135deg,#e26d6d,#f0a36b)",
  colorScheme: "light",
};

/** Vapor：冷灰蓝极简。 */
const VAPOR: PaletteTokens = {
  background: "#e5e9ef",
  surface: "#f0f2f7",
  surfaceAlt: "#e9edf3",
  text: "#3a4250",
  muted: "#7a828f",
  accent: "#5b8def",
  accentText: "#ffffff",
  accentSoft: "rgba(91,141,239,0.14)",
  border: "#c8d2de",
  link: "#5b8def",
  linkHover: "#3f6fd0",
  headerBg: "rgba(229,233,239,0.85)",
  footerBg: "#dae0e8",
  codeBg: "#e9edf3",
  shadow: "0 4px 14px rgba(30,40,60,0.08)",
  gradient: "linear-gradient(135deg,#5b8def,#8fb6f2)",
  colorScheme: "light",
};

/** 全部可选配色方案，顺序即后台下拉顺序。 */
export const PALETTE_PRESETS: PalettePreset[] = [
  {
    key: "indigo",
    label: "靛蓝夜色（默认）",
    description: "深色底 + 靛紫强调，冷静克制的原厂风格。",
    dark: true,
    tokens: INDIGO,
  },
  {
    key: "thyuu",
    label: "星度 · 暖金深空",
    description: "深色星空底 + 暖金 #FFB020 强调，沉浸感强。",
    dark: true,
    tokens: THYUU,
  },
  {
    key: "samsara",
    label: "萨姆萨拉 · 玻璃金",
    description: "深炭灰玻璃底 + 金色 #FFA000，适合配毛玻璃效果。",
    dark: true,
    tokens: SAMSARA,
  },
  {
    key: "writer",
    label: "写作者 · 暖纸白",
    description: "暖纸白底 + 海军蓝，长文阅读友好。",
    dark: false,
    tokens: WRITER,
  },
  {
    key: "somnia",
    label: "索姆尼亚 · 近白珊瑚",
    description: "近白底 + 珊瑚红，干净明亮偏杂志感。",
    dark: false,
    tokens: SOMNIA,
  },
  {
    key: "vapor",
    label: "蒸气 · 冷灰蓝",
    description: "冷灰蓝底 + 亮蓝链接，极简冷静。",
    dark: false,
    tokens: VAPOR,
  },
];

const BY_KEY = new Map(PALETTE_PRESETS.map((p) => [p.key, p]));

/** 查出配色方案；未知/空值返回 null（表示沿用 config 原样）。 */
export function getPalettePreset(key: string | null | undefined): PalettePreset | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/**
 * 把配色方案作为「默认层」叠加到主题 config 之下。
 *
 * 优先级：`DEFAULT_THEME_CONFIG` → `manifest.config` → **配色方案** →
 * `theme.config`（用户在「外观」面板的手动微调）。
 *
 * 也就是说配色方案只负责填上用户没改过的颜色，用户一旦在「外观」面板里
 * 动过某个色值，那次微调永远优先 —— 这套语义要求保存时把「与预设同值」
 * 的令牌剔除掉（见 lib/services/themes.ts 的 updateThemePanel），否则
 * 预设值会被当成用户微调永久写进 config，之后就再也换不动了。
 *
 * 未选择（key 为空）或 key 非法时原样返回 config，保证老站点升级后
 * 视觉零变化。键名与 `ThemeConfig` 同名，可直接喂给 `themeToCss`。
 */
export function applyPalette<T extends ThemeConfig | null | undefined>(
  config: T,
  key: string | null | undefined,
): ThemeConfig {
  const preset = getPalettePreset(key);
  const overrides = (config ?? {}) as ThemeConfig;
  if (!preset) return overrides;
  // 预设在底、用户微调在上。
  return { ...preset.tokens, ...overrides };
}

/** 供后台下拉直接消费的选项数组。 */
export function paletteOptions(): { value: string; label: string }[] {
  return PALETTE_PRESETS.map((p) => ({ value: p.key, label: p.label }));
}

/**
 * 判断某个令牌的当前值是否「只是配色方案提供的默认值」，即用户其实没有
 * 手动微调过它。
 *
 * 保存主题设置时把这类令牌剔除是有意的：预设值没必要落进 `themes.config`，
 * 一旦落进去就会从「方案默认」悄悄升级成「永久覆盖」，之后切换配色方案
 * 时本该变色的项会被这些陈旧值按住不动。
 */
export function isPaletteSupplied(
  key: string,
  value: string,
  paletteKeys: (string | null | undefined)[],
): boolean {
  const v = value.trim();
  if (!v) return true; // 空值从来不是有意义的覆盖
  for (const pk of paletteKeys) {
    const preset = getPalettePreset(pk);
    if (!preset) continue;
    const own = preset.tokens[key as keyof PaletteTokens];
    if (typeof own === "string" && own.trim() === v) return true;
  }
  return false;
}

/** 配色方案会覆盖到的全部令牌键名。 */
export function paletteTokenKeys(): string[] {
  return Object.keys(PALETTE_PRESETS[0]?.tokens ?? {});
}

/** 该配色是否为深色底（供主题做明暗分支）。 */
export function isDarkPalette(key: string | null | undefined): boolean {
  return getPalettePreset(key)?.dark ?? true;
}
