import { listPosts } from "@/lib/services/posts";
import { listPages } from "@/lib/services/pages";
import { getSettings } from "@/lib/services/settings";
import { renderContent } from "@/lib/services/render";
import { encodeTextResponse } from "@/lib/http/encode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// HTML 正文放进 CDATA；正文自身若含 ]]> 需拆段，避免提前关闭 CDATA。
function cdata(html: string): string {
  return `<![CDATA[${html.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const settings = await getSettings();
  // 后台「RSS 条目数」设置（1-100，缺省 20），文章与独立页面共用。
  const feedItems = Math.min(Math.max(Number(settings.feedItems) || 20, 1), 100);
  const [posts, pages] = await Promise.all([
    listPosts({ status: "published", limit: feedItems, pinned: false }),
    listPages({ status: "published", limit: feedItems }),
  ]);

  // 全文模式：逐实体走与前台一致的渲染管线（区块→短代码→content.html 过滤器）。
  const full = settings.feedContent === "full";
  const encoded = async (
    entity: { id: number; slug: string; content: unknown },
    kind: "post" | "page",
  ): Promise<string> => {
    const html = await renderContent(entity.content as Parameters<typeof renderContent>[0], {
      kind,
      postId: entity.id,
      slug: entity.slug,
      siteTitle: settings.siteTitle,
    });
    return `\n      <content:encoded>${cdata(html)}</content:encoded>`;
  };

  const items: string[] = [];
  for (const p of posts.items) {
    const extra = full ? await encoded(p, "post") : "";
    items.push(
      `    <item>\n      <title>${escapeXml(p.title)}</title>\n      <link>${base}${p.url}</link>\n      <guid>${base}${p.url}</guid>\n      <pubDate>${
        p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString()
      }</pubDate>\n      <description>${escapeXml(p.excerpt ?? "")}</description>${extra}\n    </item>`,
    );
  }
  for (const p of pages.items) {
    const extra = full ? await encoded(p, "page") : "";
    items.push(
      `    <item>\n      <title>${escapeXml(p.title)}</title>\n      <link>${base}${p.url}</link>\n      <guid>${base}${p.url}</guid>\n      <pubDate>${
        p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString()
      }</pubDate>\n      <description>${escapeXml(p.excerpt ?? "")}</description>${extra}\n    </item>`,
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(settings.siteTitle)}</title>
    <link>${base}</link>
    <description>${escapeXml(settings.siteDescription)}</description>
    <language>zh-CN</language>
${items.join("\n")}
  </channel>
</rss>`;

  // Route Handler 文本响应框架不压缩，全文 feed 可达数十 KB，按 AE 协商
  return encodeTextResponse(req, xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
