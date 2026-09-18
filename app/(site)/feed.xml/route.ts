import { listPosts } from "@/lib/services/posts";
import { listPages } from "@/lib/services/pages";
import { getSettings } from "@/lib/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const [settings, posts, pages] = await Promise.all([
    getSettings(),
    listPosts({ status: "published", limit: 20, pinned: false }),
    listPages({ status: "published", limit: 20 }),
  ]);

  const items: string[] = [];
  for (const p of posts.items) {
    items.push(
      `    <item>\n      <title>${escapeXml(p.title)}</title>\n      <link>${base}${p.url}</link>\n      <guid>${base}${p.url}</guid>\n      <pubDate>${
        p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString()
      }</pubDate>\n      <description>${escapeXml(p.excerpt ?? "")}</description>\n    </item>`,
    );
  }
  for (const p of pages.items) {
    items.push(
      `    <item>\n      <title>${escapeXml(p.title)}</title>\n      <link>${base}${p.url}</link>\n      <guid>${base}${p.url}</guid>\n      <pubDate>${
        p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString()
      }</pubDate>\n      <description>${escapeXml(p.excerpt ?? "")}</description>\n    </item>`,
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(settings.siteTitle)}</title>
    <link>${base}</link>
    <description>${escapeXml(settings.siteDescription)}</description>
    <language>zh-CN</language>
${items.join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
