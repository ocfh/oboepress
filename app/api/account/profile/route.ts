import { ok, readJson, handleError, authenticate } from "@/lib/http";
import { profileSchema } from "@/lib/validation";
import { changeOwnProfile } from "@/lib/services/users";
import { setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, profileSchema);
  if ("res" in body) return body.res;
  try {
    const user = await changeOwnProfile(auth.user, body.data);
    // 昵称/邮箱写进会话 JWT，改完立刻重签 cookie，刷新后即生效。
    await setSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return ok({ id: user.id, name: user.name, email: user.email });
  } catch (e) {
    return handleError(e);
  }
}
