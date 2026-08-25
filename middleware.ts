import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight edge guard: redirect unauthenticated visitors away from /admin.
 * Real session verification + role checks happen in the server components.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login" || pathname === "/admin/setup")
    return NextResponse.next();

  const token = req.cookies.get("cms_session")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
