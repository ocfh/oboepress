import { fail, ok, readJson, handleError, authenticate } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validation";
import { changeOwnPassword } from "@/lib/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, changePasswordSchema);
  if ("res" in body) return body.res;
  try {
    await changeOwnPassword(auth.user, body.data.currentPassword, body.data.newPassword);
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}