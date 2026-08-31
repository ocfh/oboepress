import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { siteSettingsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getSettings());
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = await readJson(req, siteSettingsSchema);
    if ("res" in body) return body.res;
    return ok(await updateSettings(body.data));
  } catch (e) {
    return handleError(e);
  }
}
