"use client";

import dynamic from "next/dynamic";
import type { RegisterConfig } from "./RegisterForm";

export type { RegisterConfig };

// 会员注册表单（昵称/邮箱/手机/验证码/密码等分支）只在自定义注册路径渲染，
// 经 client 边界 ssr:false 懒加载，避免进入 catch-all 每个公开页面的初始
// page chunk（原本整个表单都塞在路由块里随首页下发）。
const RegisterForm = dynamic(() => import("./RegisterForm"), {
  ssr: false,
  loading: () => (
    <div
      className="py-10 text-center text-sm"
      style={{ color: "var(--text-color)", opacity: 0.6 }}
    >
      加载中…
    </div>
  ),
});

export default function RegisterFormLazy({ config }: { config: RegisterConfig }) {
  return <RegisterForm config={config} />;
}
