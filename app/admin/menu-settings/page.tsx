import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import MenuSettings from "@/components/admin/MenuSettings";
import {
  buildAdminMenuAll,
  collectAdminMenuExtras,
  getAdminMenuPrefs,
} from "@/lib/admin-menu";

export const dynamic = "force-dynamic";

export default async function MenuSettingsPage() {
  const user = await getSession();
  if (!user || !can(user.role, "settings:manage")) notFound();

  const [extras, prefs] = await Promise.all([
    collectAdminMenuExtras(),
    getAdminMenuPrefs(),
  ]);

  return (
    <MenuSettings
      groups={buildAdminMenuAll(extras)}
      hiddenHrefs={prefs.hiddenHrefs}
      homePath={prefs.homePath}
    />
  );
}
