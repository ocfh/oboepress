/**
 * (site) is a URL-neutral route group that collects every public page
 * (homepage, blog, pages, archives, search, feed, sitemap) so the root app/
 * stays a thin shell. It must not wrap /admin — admin stays ungrouped on
 * purpose (route-group rebellion history), matching its own layout.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}