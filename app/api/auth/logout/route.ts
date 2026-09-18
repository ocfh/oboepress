import { ok } from "@/lib/http";
import { clearSessionCookie } from "@/lib/auth";
import { getAdminSecurity } from "@/lib/services/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sec = await getAdminSecurity();
  clearSessionCookie();
  // 告知前端伪装状态：开启时登出后不能再跳 /admin/login（已 404），
  // 要回到秘密入口，便于立即换号登录。
  return ok({
    success: true,
    entryEnabled: sec.entryEnabled,
    entryPath: sec.entryPath,
  });
}
