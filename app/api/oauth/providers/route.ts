import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/http";
import { getPublicProviders } from "@/lib/services/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 免登录公开端点：只返回已启用且配置完整的提供商（无任何密钥信息），
 * 供登录页 / 注册页渲染第三方登录按钮。管理端完整配置走 /api/oauth-config。
 */
export async function GET(_req: NextRequest) {
  try {
    return ok(await getPublicProviders());
  } catch (err) {
    return handleError(err);
  }
}
