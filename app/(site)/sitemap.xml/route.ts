import { buildSitemapDocument } from "@/lib/services/sitemap";
import { encodeTextResponse } from "@/lib/http/encode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 统一文档入口：核心默认 urlset；高级 sitemap 插件可经 sitemap.document
  // 过滤器替换为 sitemapindex（超量分片）或认领 ?kind=news / ?part=n。
  const doc = await buildSitemapDocument(req);
  if (!doc) {
    // 带查询参数但无插件认领（或分片号越界）。
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // Route Handler 文本响应框架不压缩，按 AE 协商
  return encodeTextResponse(req, doc.xml, {
    headers: { "Content-Type": doc.contentType },
  });
}
