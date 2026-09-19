import type { PublicProvider } from "@/lib/services/oauth";

/**
 * 第三方登录入口按钮（纯展示组件，后台暗色卡片 / 前台浅色卡片两套配色）。
 * 点击整跳 /api/oauth/<key>/start，由服务端 302 到提供商授权页，
 * 避免在客户端暴露任何拼装细节。
 *  - bind=true：已登录用户在账号页发起「绑定新账号」。
 *  - redirect：登录成功后的站内落点（默认 /）。
 */
export default function OAuthButtons({
  providers,
  variant = "dark",
  bind = false,
  redirect,
}: {
  providers: PublicProvider[];
  variant?: "dark" | "light";
  bind?: boolean;
  redirect?: string;
}) {
  if (!providers.length) return null;
  const href = (key: string) => {
    const base = `/api/oauth/${encodeURIComponent(key)}/start`;
    if (bind) return `${base}?bind=1`;
    if (redirect) return `${base}?redirect=${encodeURIComponent(redirect)}`;
    return base;
  };
  return (
    <div>
      <div
        className={`my-4 flex items-center gap-3 text-xs ${
          variant === "dark" ? "text-zinc-500" : "text-zinc-400"
        }`}
      >
        <span className="h-px flex-1 bg-current opacity-20" />
        其他登录方式
        <span className="h-px flex-1 bg-current opacity-20" />
      </div>
      <div className="grid grid-cols-1 gap-2">
        {providers.map((p) => (
          <a
            key={p.key}
            href={href(p.key)}
            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
              variant === "dark"
                ? "border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.label.slice(0, 1)}
            </span>
            使用 {p.label} {bind ? "绑定" : "登录"}
          </a>
        ))}
      </div>
    </div>
  );
}
