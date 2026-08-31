import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import * as themes from "@/lib/services/themes";
import { themeInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await themes.listThemes());
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
