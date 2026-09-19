import { authenticate, authorize, handleError, ok, fail } from "@/lib/http";
import { encodeTextResponse } from "@/lib/http/encode";
import { buildDatabaseBackup, restoreDatabaseBackup } from "@/lib/services/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function compactStamp(): string {
  // 形如 20260919-153012，用于下载文件名。
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14).replace(/^(\d{8})(\d{6})$/, "$1-$2");
}

// 全库备份下载（含用户/设置/插件/会员等全部业务表，不含 uploads 文件）。
export async function GET(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;

    const backup = await buildDatabaseBackup();
    const body = JSON.stringify(backup);
    return encodeTextResponse(req, body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="oboepress-db-backup-${compactStamp()}.json"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

// 整库恢复：multipart 上传备份文件 + 强制确认词。
export async function POST(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("恢复请求必须是 multipart 表单上传", 400);
    }
    if (form.get("confirm") !== "RESTORE") {
      return fail("请输入确认词 RESTORE 后再执行恢复", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail("请选择有效的备份文件", 400);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return fail("备份文件不是合法 JSON", 400);
    }

    const result = await restoreDatabaseBackup(parsed);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
