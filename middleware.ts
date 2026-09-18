import { NextRequest, NextResponse } from "next/server";

/**
 * edge 侧只打标（root layout 据此切换无主题的后台外壳），不再做登录重定向。
 * 真正的门控在 node 侧 app/admin/layout.tsx：伪装后台入口的配置存放在
 * PGlite options 表，edge runtime 读不到，统一在 node 判断才不会出现
 * “/admin/login 被隐藏后 edge 仍把游客重定向过去”的泄漏。
 */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-invoke-path", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// 全站打标：伪装后的秘密登录入口走前台 catch-all（不在 /admin 下），root
// layout 必须靠 x-invoke-path 才能识别该路径并输出无主题外壳；只匹配 /admin
// 会让入口页被主题 PublicLayout 包裹。静态资源不需要打标，排除掉。
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|theme-assets|uploads|static).*)",
  ],
};
