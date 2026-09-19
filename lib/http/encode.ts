import { deflateSync, gzipSync } from "node:zlib";

/**
 * 自托管 `next start` 下 App Router 的 Route Handler 文本响应不会被框架
 * 压缩（Vercel 等平台由边缘层负责），主题 CSS / RSS / sitemap / JSON 会以
 * 明文下发。按 Accept-Encoding 协商 gzip/deflate：
 *  - 小于 1KB 不压缩（压缩头反而更大）；
 *  - 补 Vary: Accept-Encoding，保证中间缓存键正确；
 *  - 仅 nodejs 运行时可用（node:zlib）。
 */
export function encodeTextResponse(
  req: Request,
  body: string,
  init?: ResponseInit,
): Response {
  const headers = new Headers(init?.headers);
  const existingVary = headers.get("Vary");
  headers.set(
    "Vary",
    existingVary && existingVary !== "Accept-Encoding"
      ? `${existingVary}, Accept-Encoding`
      : "Accept-Encoding",
  );

  const buf = Buffer.from(body, "utf-8");
  const ae = req.headers.get("accept-encoding") ?? "";
  const status = init?.status ?? 200;

  if (buf.length >= 1024 && /\bgzip\b/.test(ae)) {
    headers.set("Content-Encoding", "gzip");
    return new Response(new Uint8Array(gzipSync(buf, { level: 6 })), {
      status,
      statusText: init?.statusText,
      headers,
    });
  }
  if (buf.length >= 1024 && /\bdeflate\b/.test(ae)) {
    headers.set("Content-Encoding", "deflate");
    return new Response(new Uint8Array(deflateSync(buf, { level: 6 })), {
      status,
      statusText: init?.statusText,
      headers,
    });
  }
  return new Response(body, { status, statusText: init?.statusText, headers });
}
