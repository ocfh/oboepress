import { ok } from "@/lib/http";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  clearSessionCookie();
  return ok({ success: true });
}
