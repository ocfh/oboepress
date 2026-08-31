import { ok } from "@/lib/http";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return ok({ user: null });
  return ok({ user });
}
