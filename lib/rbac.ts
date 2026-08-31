import type { Role } from "@/db/schema";

/**
 * Capability-based permission matrix (WordPress / Strapi style).
 * Each role is a set of capabilities. Services check `can(role, cap)`.
 */
export type Capability =
  | "content:read"
  | "content:create"
  | "content:update:any"
  | "content:update:own"
  | "content:delete:any"
  | "content:delete:own"
  | "media:read"
  | "media:upload"
  | "taxonomy:manage"
  | "users:read"
  | "users:manage"
  | "settings:manage";

const MATRIX: Record<Role, Capability[]> = {
  admin: [
    "content:read",
    "content:create",
    "content:update:any",
    "content:update:own",
    "content:delete:any",
    "content:delete:own",
    "media:read",
    "media:upload",
    "taxonomy:manage",
    "users:read",
    "users:manage",
    "settings:manage",
  ],
  editor: [
    "content:read",
    "content:create",
    "content:update:any",
    "content:update:own",
    "content:delete:any",
    "content:delete:own",
    "media:read",
    "media:upload",
    "taxonomy:manage",
    "users:read",
  ],
  author: [
    "content:read",
    "content:create",
    "content:update:own",
    "content:delete:own",
    "media:read",
    "media:upload",
  ],
  subscriber: ["content:read"],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role]?.includes(cap) ?? false;
}

/** Can `user` modify/delete a piece of content owned by `ownerId`? */
export function canModifyContent(
  role: Role,
  ownerId: number,
  currentUserId: number,
): boolean {
  if (can(role, "content:update:any")) return true;
  if (ownerId === currentUserId && can(role, "content:update:own")) return true;
  return false;
}
