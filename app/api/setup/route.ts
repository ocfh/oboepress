import { ok, handleError, readJson } from "@/lib/http";
import { hasAnyUser, createFirstAdmin } from "@/lib/services/users";
import { updateSettings } from "@/lib/services/settings";
import { setupSchema } from "@/lib/validation";
import { setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const setupRequired = !(await hasAnyUser());
    return ok({ setupRequired });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req, setupSchema);
    if ("res" in body) return body.res;
    const admin = await createFirstAdmin(body.data);
    if (body.data.siteTitle || body.data.siteDescription || body.data.tagline || body.data.footerText) {
      await updateSettings({
        siteTitle: body.data.siteTitle,
        siteDescription: body.data.siteDescription,
        tagline: body.data.tagline,
        footerText: body.data.footerText,
      });
    }
    await setSessionCookie({ id: admin.id, email: admin.email, name: admin.name, role: "admin" });
    return ok(admin, 201);
  } catch (e) {
    return handleError(e);
  }
}
