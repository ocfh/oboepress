import { getSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import { HOOKS, applyAsyncFilters } from "@/lib/hooks";
import type { AdminMenuItem } from "@/lib/admin-extensions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  const { items } = await applyAsyncFilters(HOOKS.adminMenu, {
    items: [] as AdminMenuItem[],
  });
  return (
    <AdminShell user={user} pluginNav={items}>
      {children}
    </AdminShell>
  );
}