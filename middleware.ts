import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight edge guard: redirect unauthenticated visitors away from /admin.
 * Real session verification + role checks happen in the server components.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // Inject the real pathname into the inbound request so the root layout can
  // tell admin routes from public ones (headers has no reliable URL otherwise).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-invoke-path", pathname);

  if (pathname === "/admin/login" || pathname === "/admin/setup")
    return NextResponse.next({ request: { headers: requestHeaders } });

  const token = req.cookies.get("cms_session")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/admin/:path*"],
};