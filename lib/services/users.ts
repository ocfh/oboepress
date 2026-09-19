import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import { users } from "@/db/schema";
import type { User } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { UserInput } from "@/lib/validation";
import { can } from "@/lib/rbac";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { clearPasswordlessMark, isPasswordlessUser } from "./passwordless-mark";
import { bump } from "./public-cache";

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
  // 昵称/角色/状态变更会反映在文章列表项的作者信息上，失效 posts 缓存。
  bump("posts");
  return publicUser(row);
}

/**
 * 账号中心自助资料：读取当前用户的昵称/邮箱/手机。不经 RBAC 门控，
 * 因为任何登录用户（含 member）都需要它渲染自己的资料卡。
 */
export async function getOwnProfile(
  actor: SessionUser,
): Promise<{ id: number; name: string; email: string | null; phone: string | null }> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, actor.id));
  if (!row) throw new NotFoundError("用户不存在");
  return row;
}

/**
 * Update the current user's own display name + email + phone (self-service
 * profile box). 邮箱/手机唯一性在服务层兜底；换绑的验证码消费由路由层完成，
 * role/password 保持不动。phone 传 null 表示解绑手机。
 */
export async function changeOwnProfile(
  actor: SessionUser,
  input: { name: string; email: string; phone?: string | null },
): Promise<Omit<User, "passwordHash">> {
  const [target] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!target) throw new NotFoundError("用户不存在");
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone === undefined ? target.phone : input.phone || null;
  if (email !== target.email) {
    const [exists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (exists) throw new ValidationError("邮箱已被其他账号使用");
  }
  if (phone && phone !== target.phone) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), ne(users.id, actor.id)));
    if (taken) throw new ValidationError("手机号已被其他账号使用");
  }
  const [row] = await db
    .update(users)
    .set({ name, email, phone, updatedAt: new Date() })
    .where(eq(users.id, actor.id))
    .returning();
  bump("posts");
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
  // 纯第三方登录（nopassword）用户没有自己的旧密码，首次设置免验证；
  // 其他情况必须先验证当前密码。
  const nopassword = await isPasswordlessUser(actor.id);
  if (!nopassword && !(await verifyPassword(currentPassword, target.passwordHash)))
    throw new ValidationError("当前密码不正确");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, actor.id));
  // 纯第三方登录用户成功设置密码后，移除 nopassword 标记，此后可解绑全部第三方账号。
  await clearPasswordlessMark(actor.id);
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
  bump("posts");
  return { id };
}

/** 按账号查用户：含 @ 走邮箱（大小写不敏感），否则走昵称。供找回密码复用。 */
export async function findUserByAccount(account: string): Promise<User | null> {
  const identifier = account.trim();
  if (!identifier) return null;
  const [row] = await db
    .select()
    .from(users)
    .where(
      identifier.includes("@")
        ? sql`lower(${users.email}) = lower(${identifier})`
        : sql`lower(${users.name}) = lower(${identifier})`,
    );
  return row ?? null;
}

/**
 * 按联系方式查用户：邮箱大小写不敏感，手机号精确匹配。
 * 供邮箱/手机验证码登录复用，返回整行（含 status）由调用方裁决。
 */
export async function findUserByContact(
  channel: "email" | "sms",
  target: string,
): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(
      channel === "email"
        ? sql`lower(${users.email}) = lower(${target})`
        : sql`${users.phone} = ${target}`,
    );
  return row ?? null;
}

/** 邮箱验证码校验通过后重置密码，返回用户基础信息用于审计日志。 */
export async function resetUserPassword(
  userId: number,
  newPassword: string,
): Promise<{ id: number; name: string; email: string | null }> {
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
  // 重置后不再是「纯第三方无密码」账号。
  await clearPasswordlessMark(userId);
  return { id: userId, name: "", email: null };
}
