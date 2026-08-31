import { authenticate, authorize, handleError, ok } from "@/lib/http";
import { getDashboardStats } from "@/lib/services/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "content:read");
  if (denied) return denied;
  try {
    return ok(await getDashboardStats());
  } catch (e) {
    return handleError(e);
  }
}
