import { authenticate, handleError, ok, readJson } from "@/lib/http";
import { userInputSchema } from "@/lib/validation";
import * as users from "@/lib/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    return ok(await users.listUsers(auth.user));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, userInputSchema);
  if ("res" in body) return body.res;
  try {
    return ok(await users.createUser(auth.user, body.data), 201);
  } catch (e) {
    return handleError(e);
  }
}
