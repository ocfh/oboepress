import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getPermalinkConfig, savePermalinkConfig } from "@/lib/services/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const permalinkSchema = z.object({
  postMode: z.enum(["slug", "id", "pinyin", "initial", "custom"]).optional(),
  postPattern: z.string().optional(),
  postBase: z.string().optional(),
  pageBase: z.string().optional(),
  categoryBase: z.string().optional(),
  tagBase: z.string().optional(),
});

export async function GET() {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    return ok(await getPermalinkConfig());
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    const body = await readJson(req, permalinkSchema);
    if ("res" in body) return body.res;
    // savePermalinkConfig 负责规范化，并在切到全拼/首字母模式时回填历史文章。
    return ok(await savePermalinkConfig(body.data));
  } catch (e) {
    return handleError(e);
  }
}
