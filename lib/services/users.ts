import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import { users } from "@/db/schema";
import type { User } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { UserInput } from "@/lib/validation";
import { can } from "@/lib/rbac";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

function publicUser(u: User) {
  const { passwordHash, ...rest } = u;
  return rest;
}

/** True when no accounts exist yet — drives the first-run setup screen. */
export async function hasAnyUser(): Promise<boolean> {
  await ensureMigrations();
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count ?? 0) > 0;
}

/**
 * Create the very first admin account during first-run setup. Only allowed
 * when the users table is empty, so it can't be abused to escalate privileges.
 */
export async function createFirstAdmin(input: {
  email: string;
  name: string;
  password: string;
}): Promise<Omit<User, "passwordHash">> {
  if (await hasAnyUser()) throw new ValidationError("系统已初始化，无法重复创建管理员");
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: "admin",
    })
    .returning();
  return publicUser(row);
}

export async function listUsers(user: SessionUser): Promise<Omit<User, "passwordHash">[]> {
  if (!can(user.role, "users:read")) throw new ForbiddenError();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return rows.map(publicUser);
}

export async function getUser(
  user: SessionUser,
  id: number,
): Promise<Omit<User, "passwordHash">> {
  if (!can(user.role, "users:read")) throw new ForbiddenError();
  const [row] = await db.select().from(users).where(eq(users.id, id));
  if (!row) throw new NotFoundError("用户不存在");
  return publicUser(row);
}

export async function createUser(
  user: SessionUser,
  input: UserInput,
): Promise<Omit<User, "passwordHash">> {
  if (!can(user.role, "users:manage")) throw new ForbiddenError();
  const [exists] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email));
  if (exists) throw new ValidationError("邮箱已存在");
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: input.role ?? "author",
      bio: input.bio,
    })
    .returning();
  return publicUser(row);
}

export type UserUpdate = {
  name?: string;
  bio?: string;
  password?: string;
  role?: User["role"];
  email?: string;
  /** "" or null clears the phone. */
  phone?: string | null;
  status?: User["status"];
};

export async function updateUser(
  actor: SessionUser,
  id: number,
  input: UserUpdate,
): Promise<Omit<User, "passwordHash">> {
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) throw new NotFoundError("用户不存在");

  const isSelf = actor.id === id;
  const managing = can(actor.role, "users:manage");

  // Role / email / ban changes require admin-level management rights.
  if (
    (input.role !== undefined ||
      input.email !== undefined ||
      input.status !== undefined) &&
    !managing
  )
    throw new ForbiddenError("无权修改角色、邮箱或账号状态");
  if (!isSelf && !managing) throw new ForbiddenError("无权修改其他用户");

  const phone = input.phone === undefined ? target.phone : input.phone || null;
  if (phone && phone !== target.phone) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), ne(users.id, id)));
    if (taken) throw new ValidationError("手机号已被其他账号使用");
  }

  const [row] = await db
    .update(users)
    .set({
      name: input.name ?? target.name,
      bio: input.bio !== undefined ? input.bio : target.bio,
      email: input.email ?? target.email,
      role: input.role ?? target.role,
      phone,
      status: input.status ?? target.status,
      passwordHash: input.password
        ? await hashPassword(input.password)
        : target.passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();
  return publicUser(row);
}

/**
 * Update the current user's own display name + email (self-service profile
 * box). Email uniqueness is enforced; role/password stay untouched.
 */
export async function changeOwnProfile(
  actor: SessionUser,
  input: { name: string; email: string },
): Promise<Omit<User, "passwordHash">> {
  const [target] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!target) throw new NotFoundError("用户不存在");
  const name = input.name.trim();
  const email = input.email.trim();
  if (email !== target.email) {
    const [exists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (exists) throw new ValidationError("邮箱已被其他账号使用");
  }
  const [row] = await db
    .update(users)
    .set({ name, email, updatedAt: new Date() })
    .where(eq(users.id, actor.id))
    .returning();
  return publicUser(row);
}

/** Change the current user's own password after verifying the existing one. */
export async function changeOwnPassword(
  actor: SessionUser,
  currentPassword: string,
  newPassword: string,
): Promise<{ id: number }> {
  const [target] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!target) throw new NotFoundError("用户不存在");
  if (!(await verifyPassword(currentPassword, target.passwordHash)))
    throw new ValidationError("当前密码不正确");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, actor.id));
  return { id: actor.id };
}

export async function deleteUser(
  actor: SessionUser,
  id: number,
): Promise<{ id: number }> {
  if (!can(actor.role, "users:manage")) throw new ForbiddenError();
  if (actor.id === id) throw new ValidationError("不能删除当前登录账号");
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
  if (!target) throw new NotFoundError("用户不存在");
  await db.delete(users).where(eq(users.id, id));
  return { id };
}
