import { authenticate, authorize, fail, handleError, ok } from "@/lib/http";
import * as pluginService from "@/lib/services/plugins";
import { MAX_ZIP_BYTES } from "@/lib/services/package-install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 插件 zip 上传安装：multipart 字段 file。校验通过后解压进 plugins/<slug>，
 * 新插件默认停用；不合规由服务层抛 ValidationError 且自动删除临时文件。
 */
export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("请选择要上传的 zip 安装包", 400);
    if (!/\.zip$/i.test(file.name)) return fail("只支持 .zip 格式的安装包", 400);
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_ZIP_BYTES) {
      return fail(`安装包不能超过 ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB`, 400);
    }
    const plugin = await pluginService.installPluginZip(buf);
    return ok({ data: plugin }, 201);
  } catch (e) {
    return handleError(e);
  }
}
