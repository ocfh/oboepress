import { NextResponse } from "next/server";
import { z, type ZodTypeAny } from "zod";
import { getSession, type SessionUser } from "./auth";
import { can, type Capability } from "./rbac";
import { ServiceError } from "./services/errors";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Parse + validate a JSON request body with Zod. Returns the schema's OUTPUT type. */
export async function readJson<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { res: fail("请求体不是合法 JSON", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      res: fail(parsed.error.issues.map((i) => i.message).join("; "), 422),
    };
  }
  return { data: parsed.data };
}

export type AuthResult = { user: SessionUser } | { res: NextResponse };

/** Authenticate the request from the session cookie. */
export async function authenticate(): Promise<AuthResult> {
  const user = await getSession();
  if (!user) return { res: fail("未认证", 401) };
  return { user };
}

/** Returns a 403 response if the user lacks the capability, else null. */
export function authorize(
  user: SessionUser,
  cap: Capability,
): NextResponse | null {
  if (!can(user.role, cap)) return fail("权限不足", 403);
  return null;
}

/** Map a thrown service error to a JSON response. */
export function handleError(e: unknown): NextResponse {
  if (e instanceof ServiceError) return fail(e.message, e.status);
  console.error(e);
  return fail("服务器内部错误", 500);
}
