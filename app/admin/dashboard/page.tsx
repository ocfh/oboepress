import { redirect } from "next/navigation";
import Dashboard from "@/components/admin/Dashboard";
import { ADMIN_HOME_DEFAULT, getAdminMenuPrefs } from "@/lib/admin-menu";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { homePath } = await getAdminMenuPrefs();
  // 默认首页就是仪表盘时，规范回 /admin。
  if (homePath === ADMIN_HOME_DEFAULT) redirect(ADMIN_HOME_DEFAULT);
  return <Dashboard />;
}
