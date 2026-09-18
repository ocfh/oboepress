import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import { HOOKS, applyAsyncFilters } from "@/lib/hooks";
import { ensurePluginsLoaded } from "@/lib/services/plugins";
import { getAdminSecurity } from "@/lib/services/security";
import type { AdminMenuItem } from "@/lib/admin-extensions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  await ensurePluginsLoaded();

  // 伪装入口开启时，未登录看到的整个 /admin 树（含登录/初始化页）都是 404，
  // 与 Typecho 改名后台目录后的表现一致；真正的登录只在秘密入口进行。
  const sec = await getAdminSecurity();
  const pathname = (
    headers().get("x-invoke-path") ??
    headers().get("next-url") ??
    ""
  ).split("?")[0];
  const standalone = pathname === "/admin/login" || pathname === "/admin/setup";
  if (sec.entryEnabled && !user) notFound();
  // 伪装关闭时保留原有体验：业务页未登录跳登录页（原 edge 重定向下沉到
  // node，因为 edge 读不到伪装配置）。
  if (!user && !standalone) {
    redirect(`/admin/login?from=${encodeURIComponent(pathname || "/admin")}`);
  }

  const { items } = await applyAsyncFilters(HOOKS.adminMenu, {
    items: [] as AdminMenuItem[],
  });
  return (
    <AdminShell user={user} pluginNav={items}>
      {children}
    </AdminShell>
  );
}
