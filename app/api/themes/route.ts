import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import * as themes from "@/lib/services/themes";
import { themeInputSchema } from "@/lib/validation";
import { getThemeManifest } from "@/themes/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await themes.listThemes();
    // 版本/作者/介绍/网址/更新时间只存在于 manifest.json（数据库只存设计令牌），
    // 后台卡片需要展示，故在低频的列表接口上按 slug 附带只读 meta。
    const data = rows.map((t) => {
      const m = getThemeManifest(t.slug);
      return {
        ...t,
        meta: m
          ? {
              description: m.description,
              version: m.version,
              author: m.author,
              homepage: m.homepage ?? null,
              updatedAt: m.updatedAt ?? null,
            }
          : null,
      };
    });
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = await readJson(req, themeInputSchema);
    if ("res" in body) return body.res;
    return ok(await themes.createTheme(body.data), 201);
  } catch (e) {
    return handleError(e);
  }
}
