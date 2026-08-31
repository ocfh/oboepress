import { listPosts } from "@/lib/services/posts";
import { listPages } from "@/lib/services/pages";
import { listCategories } from "@/lib/services/taxonomies";
import { listTags } from "@/lib/services/taxonomies";
import { getSettings } from "@/lib/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  const base = new URL(req.url).origin;

  const [posts, pages, categories, tags] = await Promise.all([
    listPosts({ status: "published", limit: 10000 }),
    listPages({ status: "published", limit: 10000 }),
    listCategories(),
    listTags(),
  ]);

  const urls: string[] = [`<url><loc>${base}/</loc></url>`];
  for (const p of posts.items) urls.push(`<url><loc>${esc(`${base}/blog/${p.slug}`)}</loc></url>`);
  for (const p of pages.items) urls.push(`<url><loc>${esc(`${base}/${p.slug}`)}</loc></url>`);
  for (const c of categories) urls.push(`<url><loc>${esc(`${base}/blog/category/${c.slug}`)}</loc></url>`);
  for (const t of tags) urls.push(`<url><loc>${esc(`${base}/blog/tag/${t.slug}`)}</loc></url>`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
