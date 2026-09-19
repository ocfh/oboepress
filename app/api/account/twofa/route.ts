import { authenticate, fail, handleError, ok, readJson } from "@/lib/http";
import { twoFaActionSchema } from "@/lib/validation";
import {
  beginEnrollment,
  confirmEnrollment,
  disableTwoFa,
  getTwoFaStatus,
  isTwoFactorPluginEnabled,
  regenerateRecoveryCodes,
} from "@/lib/services/twofa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 两步验证自助接口（当前登录用户管理自己的 TOTP）。
 * 插件停用时整组接口按 404 处理，与“功能不存在”一致。
 */
async function ensureEnabled() {
  return (await isTwoFactorPluginEnabled()) ? null : fail("接口不存在", 404);
}

export async function GET() {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const gone = await ensureEnabled();
  if (gone) return gone;
  try {
    return ok(await getTwoFaStatus(auth.user));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const gone = await ensureEnabled();
  if (gone) return gone;
  const body = await readJson(req, twoFaActionSchema);
  if ("res" in body) return body.res;
  try {
    const input = body.data;
    if (input.action === "begin") {
      return ok(await beginEnrollment(auth.user));
    }
    if (input.action === "confirm") {
      const recoveryCodes = await confirmEnrollment(auth.user, input.code);
      return ok({ enabled: true, recoveryCodes });
    }
    if (input.action === "regen") {
      const recoveryCodes = await regenerateRecoveryCodes(auth.user, input.code);
      return ok({ recoveryCodes });
    }
    await disableTwoFa(auth.user, input.password);
    return ok({ enabled: false });
  } catch (e) {
    return handleError(e);
  }
}
