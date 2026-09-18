import type { Metadata } from "next";
import Link from "next/link";

/**
 * 伪装后台开启时，未登录访问 /admin* 统一落到此 404。
 * 刻意不出现任何 OboePress / 后台字样，避免入口扫描器据此识别站点程序。
 */
// absolute 绕过 root title template；伪装上下文的 root metadata 不含站名，
// 这里显式给一个中性的文档标题。
export const metadata: Metadata = {
  title: { absolute: "404" },
  robots: { index: false, follow: false },
};

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-center">
      <p className="text-6xl font-bold text-zinc-800">404</p>
      <p className="mt-4 text-sm text-zinc-500">页面不存在或已被移动。</p>
      <Link
        href="/"
        className="mt-6 text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
      >
        返回首页
      </Link>
    </div>
  );
}
