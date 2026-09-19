"use client";

import dynamic from "next/dynamic";

// 伪装后台入口由前台 catch-all 在命中秘密路径时渲染。若在 RSC 里静态引入
// AdminLogin，整个后台登录表单（含 OAuth/验证码/2FA 分支，十余 KB）会进入
// 每个公开页面的初始 chunk；经此 client 边界 ssr:false 懒加载后，仅真正
// 访问秘密入口的访客才下载它。额外收益：入口 HTML 不含任何登录表单标记，
// 伪装更彻底（/admin/login 页仍保持静态引入与 SSR，不受影响）。
const AdminLogin = dynamic(() => import("./AdminLogin"), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-zinc-950" aria-hidden />,
});

export default function AdminLoginLazy() {
  return <AdminLogin />;
}
