import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { startOAuth, STATE_COOKIE } from "@/lib/services/oauth";
import { fail, handleError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/<provider>/start?redirect=<站内路径>&bind=1
 * 未登录：发起登录/注册授权；已登录带 bind=1：发起账号绑定授权。
 */
export async function GET(
  req: Request,
  { params }: { params: { provider: string } },
) {
  try {
    const key = decodeURIComponent(params.provider);
    const url = new URL(req.url);
    const bind = url.searchParams.get("bind") === "1";
    const redirect = url.searchParams.get("redirect") ?? undefined;
    const session = await getSession();

    if (bind) {
      if (!session) return fail("请先登录后再绑定账号", 401);
    }

    const { authorizeUrl, state } = await startOAuth({
      key,
      origin: url.origin,
      bindUserId: bind ? session!.id : undefined,
      redirect: bind ? "/admin/account" : redirect,
    });
    // state 同时写 httpOnly cookie，回调时与 URL 中的 state 双重比对防 CSRF。
    cookies().set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/api/oauth",
      maxAge: 600,
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.redirect(authorizeUrl, 302);
  } catch (e) {
    return handleError(e);
  }
}
