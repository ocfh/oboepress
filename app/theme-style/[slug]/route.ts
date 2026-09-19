import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * 主题样式表输出口：/theme-style/<slug>?v=<mtime 版本串>
 *
 * 把主题目录下的 <slug>.css 与 <slug>-extra.css 合并为一个响应（拼接顺序与
 * 旧版内联一致）。immutable 长缓存 + ETag 304：
 *  - 首次访问后浏览器整年复用，PJAX 软导航零请求；
 *  - HTML/RSC 不再每个响应携带约 107KB 的内联 CSS；
 *  - 盘上文件改动后 mtime 版本串变化，URL 变化即自动失效。
 */

const IMMUTABLE = "public, max-age=31536000, immutable";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const slug = params.slug;
  // 主题目录名仅允许安全字符，从根上杜绝路径穿越
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const themeDir = path.resolve(process.cwd(), "themes", slug);
  const mainPath = path.join(themeDir, `${slug}.css`);
  const extraPath = path.join(themeDir, `${slug}-extra.css`);

  let mainStat;
  try {
    mainStat = statSync(mainPath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (mainStat.isDirectory()) {
    return new NextResponse("Not found", { status: 404 });
  }

  // extra 文件可选（bluemix 有，其它主题未必有）
  let extraStat = null;
  try {
    const s = statSync(extraPath);
    if (!s.isDirectory()) extraStat = s;
  } catch {
    /* 无 extra 文件属于正常情况 */
  }

  const etag = `"${slug}-${mainStat.mtimeMs.toString(36)}-${mainStat.size.toString(36)}-${
    extraStat
      ? `${extraStat.mtimeMs.toString(36)}-${extraStat.size.toString(36)}`
      : "0"
  }"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": IMMUTABLE },
    });
  }

  const main = readFileSync(mainPath, "utf-8");
  const extra = extraStat ? readFileSync(extraPath, "utf-8") : "";
  const body = extra ? `${main}\n${extra}` : main;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": IMMUTABLE,
      ETag: etag,
    },
  });
}
