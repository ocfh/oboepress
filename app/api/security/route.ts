import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import { getAdminSecurity, saveAdminSecurity } from "@/lib/services/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const securitySchema = z.object({
  entryEnabled: z.boolean().optional(),
  entryPath: z.string().optional(),
  captchaEnabled: z.boolean().optional(),
  captchaMode: z.enum(["builtin", "custom"]).optional(),
  captchaVerifyUrl: z.string().optional(),
  captchaVerifyMethod: z.enum(["POST", "GET", "PUT"]).optional(),
  captchaVerifyHeaders: z.string().max(2000).optional(),
  captchaVerifyBody: z.string().max(2000).optional(),
  captchaVerifySuccess: z.string().max(100).optional(),
  throttleEnabled: z.boolean().optional(),
  throttleMaxFailures: z.number().int().positive().optional(),
  throttleWindowMinutes: z.number().int().positive().optional(),
});

export async function GET() {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    return ok(await getAdminSecurity());
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
    const body = await readJson(req, securitySchema);
    if ("res" in body) return body.res;
    return ok(await saveAdminSecurity(body.data));
  } catch (e) {
    return handleError(e);
  }
}
