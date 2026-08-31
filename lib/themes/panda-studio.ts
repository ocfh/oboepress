import type { ThemeConfig } from "@/db/schema";

/**
 * Panda Studio 文档站主题 — 蓝色渐变 + 3D 书架 + 玻璃态侧边栏
 */
export const PANDA_STUDIO_THEME_CONFIG: ThemeConfig = {
  background: "#eef2ff",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  text: "#1e293b",
  muted: "#64748b",
  accent: "#2563eb",
  accentText: "#ffffff",
  accentSoft: "rgba(37,99,235,0.12)",
  border: "#c7d2fe",
  link: "#2563eb",
  linkHover: "#1d4ed8",
  headerBg: "rgba(255,255,255,0.82)",
  footerBg: "#e0e7ff",
  codeBg: "#f1f5f9",
  radius: "12px",
  radiusLarge: "20px",
  shadow: "0 10px 30px rgba(30,58,138,0.10)",
  font: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  containerWidth: "1280px",
  contentWidth: "820px",
  sidebar: "left",
  listStyle: "card",
  glass: "on",
  gradient: "linear-gradient(135deg,#2563eb,#7c3aed)",
};
