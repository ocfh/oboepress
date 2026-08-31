import { fail, ok, readJson, handleError } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { verifyCredentials, setSessionCookie, clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req, loginSchema);
  if ("res" in body) return body.res;
  try {
    const user = await verifyCredentials(body.data.email, body.data.password);
    if (!user) return fail("邮箱或密码错误", 401);
    await setSessionCookie(user);
    return ok({ user });
  } catch (e) {
    return handleError(e);
  }
}
