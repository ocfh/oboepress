import { authenticate, authorize, fail, handleError, ok } from "@/lib/http";
import { saveAdminMenuPrefs } from "@/lib/admin-menu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const denied = authorize(auth.user, "settings:manage");
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const saved = await saveAdminMenuPrefs({
      hiddenHrefs: (body as { hiddenHrefs?: unknown })?.hiddenHrefs,
      homePath: (body as { homePath?: unknown })?.homePath,
    });
    return ok(saved);
  } catch (e) {
    if (e instanceof Error) return fail(e.message, 400);
    return handleError(e);
  }
}
