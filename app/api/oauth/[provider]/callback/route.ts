import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, setSessionCookie } from "@/lib/auth";
import {
  handleOAuthCallback,
  STATE_COOKIE,
} from "@/lib/services/oauth";
import { getAdminSecurity } from "@/lib/services/security";
import { ServiceError } from "@/lib/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearStateCookie() {
  // 与 start 时相同的 path 才能可靠覆盖/失效。
  cookies().set(STATE_COOKIE, "", {
    path: "/api/oauth",
    maxAge: 0,
  });
}

/** 授权失败后回到登录入口（伪装开启时回秘密入口，否则回 /admin/login）。 */
async function redirectWithError(req: Request, message: string) {
  const sec = await getAdminSecurity();
  const entry = sec.entryEnabled ? sec.entryPath : "/admin/login";
  const to = new URL(entry, req.url);
  to.searchParams.set("oauth_error", message);
  return NextResponse.redirect(to, 302);
}

/**
 * GET /api/oauth/<provider>/callback?code=&state=
 * 提供商授权后回调：交换令牌 → 归一化资料 → 登录/合并/建号/绑定 → 写会话 302。
 */
export async function GET(
  req: Request,
  { params }: { params: { provider: string } },
) {
  try {
    const key = decodeURIComponent(params.provider);
    const url = new URL(req.url);
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const stateCookie = cookies().get(STATE_COOKIE)?.value ?? null;
    const session = await getSession();

    if (!code || !state) {
      clearStateCookie();
      return redirectWithError(req, "授权回调缺少必要参数");
    }

    const result = await handleOAuthCallback({
      key,
      code,
      state,
      stateCookie,
      origin: url.origin,
      currentUserId: session?.id,
    });
    clearStateCookie();
    await setSessionCookie(result.user);

    let to = result.redirectTo;
    // 新建账号且还缺邮箱/密码：先进账号页补资料。
    if (result.mode === "registered" && result.needProfile) {
      to = "/admin/account?oauth_new=1";
    }
    return NextResponse.redirect(new URL(to, url.origin), 302);
  } catch (e) {
    clearStateCookie();
    const msg =
      e instanceof ServiceError ? e.message : "第三方登录失败，请重试";
    return redirectWithError(req, msg);
  }
}
