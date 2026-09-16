/**
 * (site) is a URL-neutral route group that collects every public page
 * (homepage, blog, pages, archives, search, feed, sitemap) so the root app/
 * stays a thin shell. It must not wrap /admin — admin stays ungrouped on
 * purpose (route-group rebellion history), matching its own layout.
 */

import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/services/users";

export const dynamic = "force-dynamic";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // First-run guard: before a site owner is created, steer any public visit to
  // the setup wizard so an empty repo doesn't render as a "pre-configured" site.
  if (!(await hasAnyUser())) {
    redirect("/admin/setup");
  }
  return <>{children}</>;
}