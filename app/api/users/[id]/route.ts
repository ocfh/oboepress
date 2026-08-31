import { z } from "zod";
import { authenticate, handleError, ok, readJson } from "@/lib/http";
import * as users from "@/lib/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(["admin", "editor", "author", "subscriber"]).optional(),
  email: z.string().email().optional(),
});

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    return ok(await users.getUser(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, updateSchema);
  if ("res" in body) return body.res;
  try {
    return ok(await users.updateUser(auth.user, Number(params.id), body.data));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  try {
    return ok(await users.deleteUser(auth.user, Number(params.id)));
  } catch (e) {
    return handleError(e);
  }
}
