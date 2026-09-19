import { Construction } from "lucide-react";
import type { MaintenanceSettings } from "@/lib/services/maintenance";

/**
 * 维护模式前台占位屏。纯展示组件，配色走主题 CSS 变量并带完整兜底链，
 * bluemix（--text-color/--primary-color）与默认主题（--text/--accent）都能适配。
 */
export default function MaintenanceScreen({
  settings,
}: {
  settings: MaintenanceSettings;
}) {
  const paragraphs = settings.message
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div
        className="w-full max-w-lg rounded-2xl border p-10 text-center"
        style={{
          borderColor: "var(--border-color, var(--border, #e5e7eb))",
          background: "var(--surface-color, var(--surface, #ffffff))",
        }}
      >
        <span
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border"
          style={{
            borderColor: "var(--primary-color, var(--accent, #1f8bff))",
            color: "var(--primary-color, var(--accent, #1f8bff))",
          }}
        >
          <Construction size={26} />
        </span>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-color, var(--text, #1f2937))" }}
        >
          {settings.title}
        </h1>
        <div
          className="mt-3 space-y-2 text-sm leading-6"
          style={{ color: "var(--muted-color, var(--muted, #6b7280))" }}
        >
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
