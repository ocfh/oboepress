import { z } from "zod";
import {
  authenticate,
  fail,
  handleError,
  ok,
  readJson,
} from "@/lib/http";
import {
  getPublicProviders,
  listUserIdentities,
  unbindUserIdentity,
} from "@/lib/services/oauth";
import { isPasswordlessUser } from "@/lib/services/passwordless-mark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET：当前用户的全部第三方绑定 + 可绑定的已启用提供商 + 无密码标记。 */
export async function GET() {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const [identities, providers, passwordless] = await Promise.all([
      listUserIdentities(auth.user.id),
      getPublicProviders(),
      isPasswordlessUser(auth.user.id),
    ]);
    return ok({ identities, providers, passwordless });
  } catch (e) {
    return handleError(e);
  }
}

const unbindSchema = z.object({ identityId: z.number().int().positive() });

/** DELETE：解绑指定第三方账号（最后一个且无密码时服务层拒绝）。 */
export async function DELETE(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const body = await readJson(req, unbindSchema);
    if ("res" in body) return body.res;
    await unbindUserIdentity(auth.user.id, body.data.identityId);
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export function POST() {
  return fail("不支持的操作", 405);
}
