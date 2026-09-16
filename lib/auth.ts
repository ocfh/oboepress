import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Role } from "@/db/schema";

const COOKIE_NAME = "cms_session";
const SESSION_DAYS = 7;

// 零配置本地兜底：未设 AUTH_SECRET 时持久化随机密钥，会话跨重启存活；
// .data/ 已 gitignore、不进生产。
const DEV_SECRET_PATH = path.resolve(process.cwd(), ".data", ".auth-secret");

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
};

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return new TextEncoder().encode(secret);

  // 未设 AUTH_SECRET 时零配置生成并持久化随机密钥（gitignored），
  // 生产环境应显式设置以跨实例稳定会话。
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[oboepress] AUTH_SECRET is not set — using an auto-generated local secret. " +
        "Set AUTH_SECRET in production to keep sessions stable across instances.",
    );
  }
  try {
    fs.mkdirSync(path.dirname(DEV_SECRET_PATH), { recursive: true });
    if (!fs.existsSync(DEV_SECRET_PATH)) {
      fs.writeFileSync(DEV_SECRET_PATH, crypto.randomBytes(32).toString("hex"), {
        mode: 0o600,
      });
    }
    return new TextEncoder().encode(fs.readFileSync(DEV_SECRET_PATH, "utf8"));
  } catch {
    // Last resort: in-memory secret (sessions invalid after a restart).
    return new TextEncoder().encode(crypto.randomBytes(32).toString("hex"));
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  cookies().set(COOKIE_NAME, token, cookieOptions());
}

/** Validate email + password, returning a session user or null. */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  if (!row) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function clearSessionCookie(): void {
  cookies().delete(COOKIE_NAME);
}

async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      id: payload.id as number,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Read the current session in a Server Component or Route Handler. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Read the session from a raw Request (used by the GraphQL context). */
export async function getSessionFromRequest(
  req: Request,
): Promise<SessionUser | null> {
  const header = req.headers.get("cookie");
  if (header) {
    const match = header
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE_NAME}=`));
    if (match) {
      const token = match.slice(COOKIE_NAME.length + 1);
      return verifyToken(token);
    }
  }
  // Also support Bearer token for API clients.
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return verifyToken(auth.slice(7));
  }
  return null;
}
