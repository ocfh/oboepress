import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import {
  getMaintenanceSettings,
  saveMaintenanceSettings,
} from "@/lib/services/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  enabled: z.boolean().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
});

export async function GET() {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    return ok(await getMaintenanceSettings());
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
    const body = await readJson(req, schema);
    if ("res" in body) return body.res;
    return ok(await saveMaintenanceSettings(body.data));
  } catch (e) {
    return handleError(e);
  }
}
