import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getMemberSettings, saveMemberSettings } from "@/lib/services/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const memberSchema = z.object({
  registerEnabled: z.boolean().optional(),
  registerPath: z.string().optional(),
  emailRequired: z.boolean().optional(),
  phoneRequired: z.boolean().optional(),
  captchaEnabled: z.boolean().optional(),
  defaultRole: z.enum(["subscriber", "author"]).optional(),
});

export async function GET() {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    return ok(await getMemberSettings());
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
    const body = await readJson(req, memberSchema);
    if ("res" in body) return body.res;
    return ok(await saveMemberSettings(body.data));
  } catch (e) {
    return handleError(e);
  }
}
