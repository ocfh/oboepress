import { handleError, ok } from "@/lib/http";
import { getPublicRegisterConfig } from "@/lib/services/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 公开注册配置：登录页据此决定是否显示“注册”入口，注册页据此渲染字段与
 * 验证码区。关闭时只暴露 enabled:false，不泄露配置路径。
 */
export async function GET() {
  try {
    return ok(await getPublicRegisterConfig());
  } catch (e) {
    return handleError(e);
  }
}
