import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, posts, pages, users, type Comment } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ForbiddenError, NotFoundError } from "./errors";
import { getSettings } from "./settings";
import { getAvatarUrl } from "@/lib/avatar";
import { ensurePluginsLoaded } from "./plugins";
import { applyAsyncFilters, HOOKS } from "@/lib/hooks";

export type CommentInput = {
  postId: number;
  postType?: string;
  parentId?: number | null;
  userId?: number | null;
  authorName: string;
  authorEmail?: string | null;
  authorUrl?: string | null;
  content: string;
  ip?: string | null;
};

export type CommentWithMeta = Comment & {
  parentName?: string;
  postTitle?: string;
  /** Resolved avatar URL for the built-in comment widget (server-computed). */
  avatarUrl?: string | null;
};

function tableFor(postType: string) {
  return postType === "page" ? pages : posts;
}

/** Keep the denormalized comment counter on the parent content in sync. */
async function bumpCount(postType: string, postId: number, delta: number) {
  const t = tableFor(postType);
  await db
    .update(t)
    .set({ commentsCount: sql`${t.commentsCount} + ${delta}` })
    .where(eq(t.id, postId));
}

function triggered(keywords: string, haystack: string): boolean {
  if (!keywords) return false;
  const words = keywords.split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
  return words.some((w) => haystack.includes(w));
}

export async function listComments(filter: {
  postId?: number;
  postType?: string;
  status?: string;
  parentId?: number | null;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
} = {}): Promise<{ items: CommentWithMeta[]; total: number }> {
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;
  const order = filter.order ?? "desc";

  const conditions = [];
  if (filter.postId) conditions.push(eq(comments.postId, filter.postId));
  if (filter.postType) conditions.push(eq(comments.postType, filter.postType));
  if (filter.status) conditions.push(eq(comments.status, filter.status as Comment["status"]));
  if (filter.parentId !== undefined)
    conditions.push(filter.parentId ? eq(comments.parentId, filter.parentId) : sql`${comments.parentId} IS NULL`);
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(order === "asc" ? asc(comments.createdAt) : desc(comments.createdAt))
    .limit(limit)
    .offset(offset);

  // Resolve each commenter's avatar URL from the configured avatar source.
  const settings = await getSettings();
  const items: CommentWithMeta[] = rows.map((c) => ({
    ...c,
    avatarUrl: getAvatarUrl(c.authorEmail, {
      source: (settings.avatarSource as any) || "gravatar",
      size: settings.avatarSize ?? 80,
      default: settings.avatarDefault || "identicon",
      rating: settings.avatarRating || "g",
    }),
  }));

  const totalRows = await db.select({ n: sql<number>`count(*)` }).from(comments).where(where);
  return { items, total: Number(totalRows[0]?.n ?? 0) };
}

/** Public-facing tree of published comments for a post/page. */
export async function getPublishedTree(postId: number, postType: string) {
  const { items } = await listComments({
    postId,
    postType,
    status: "published",
    limit: 1000,
    order: "asc",
  });
  const byId = new Map<number, any>();
  items.forEach((c) =>
    byId.set(c.id, { ...c, children: [] as any[], parentName: "" }),
  );
  const roots: any[] = [];
  for (const c of items) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function createComment(input: CommentInput): Promise<{
  comment: Comment;
  isPublic: boolean;
}> {
  const postType = input.postType ?? "post";
  const [parent] = await db
    .select({ commentStatus: posts.commentStatus, title: posts.title })
    .from(tableFor(postType))
    .where(eq(tableFor(postType).id, input.postId));
  if (!parent) throw new NotFoundError("内容不存在");

  const settings = await getSettings();
  const isStaff =
    input.userId != null &&
    (await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId))).shift();

  // Global switch: closed everywhere unless staff.
  if (!settings.commentsEnabled && !(isStaff && isStaff.role !== "subscriber")) {
    throw new ForbiddenError("评论已关闭");
  }
  // Per-content switch.
  if (parent.commentStatus === "closed" && !(isStaff && isStaff.role !== "subscriber")) {
    throw new ForbiddenError("本文评论已关闭");
  }

  let authorName = input.authorName?.trim() || "匿名";
  let authorEmail = input.authorEmail ?? null;
  let authorUrl = input.authorUrl ?? null;

  // Logged-in users' identity overrides the submitted guest fields.
  if (input.userId) {
    const [u] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, input.userId));
    if (u) {
      authorName = u.name;
      authorEmail = u.email;
    }
  }

  const haystack = [input.content, authorName, authorEmail ?? "", authorUrl ?? ""].join("\n");
  let status: Comment["status"] = "published";
  if (settings.commentModeration) status = "pending";
  if (triggered(settings.commentModerationWords, haystack)) status = "pending";

  // Let comment-moderation plugins (e.g. comment-guard) weigh in on approval.
  await ensurePluginsLoaded();
  const reviewed = await applyAsyncFilters(HOOKS.commentApprove, {
    comment: {
      content: input.content,
      userId: input.userId ?? null,
      authorUrl: authorUrl ?? null,
    },
    status,
    reason: undefined as string | undefined,
  });
  status = reviewed.status;

  const [comment] = await db
    .insert(comments)
    .values({
      postId: input.postId,
      postType,
      parentId: input.parentId ?? null,
      userId: input.userId ?? null,
      authorName,
      authorEmail,
      authorUrl,
      content: input.content,
      status,
      ip: input.ip ?? null,
    })
    .returning();

  if (status === "published") await bumpCount(postType, input.postId, 1);

  return { comment, isPublic: status === "published" };
}

export async function getComment(id: number): Promise<Comment> {
  const [row] = await db.select().from(comments).where(eq(comments.id, id));
  if (!row) throw new NotFoundError("评论不存在");
  return row;
}

export async function updateComment(
  user: SessionUser,
  id: number,
  input: { status?: string; content?: string; authorName?: string; authorEmail?: string; authorUrl?: string },
): Promise<Comment> {
  if (!can(user.role, "content:update:any")) throw new ForbiddenError();
  const existing = await getComment(id);
  const patch: Partial<typeof existing> = {};
  if (input.status !== undefined) patch.status = input.status as Comment["status"];
  if (input.content !== undefined) patch.content = input.content;
  if (input.authorName !== undefined) patch.authorName = input.authorName;
  if (input.authorEmail !== undefined) patch.authorEmail = input.authorEmail;
  if (input.authorUrl !== undefined) patch.authorUrl = input.authorUrl;

  const [updated] = await db.update(comments).set(patch).where(eq(comments.id, id)).returning();

  // Keep the public counter consistent if a status flip changes visibility.
  if (input.status !== undefined && input.status !== existing.status) {
    if (input.status === "published" && existing.status !== "published")
      await bumpCount(existing.postType, existing.postId, 1);
    if (existing.status === "published" && input.status !== "published")
      await bumpCount(existing.postType, existing.postId, -1);
  }
  return updated;
}

export async function deleteComment(user: SessionUser, id: number): Promise<{ id: number }> {
  if (!can(user.role, "content:delete:any")) throw new ForbiddenError();
  const existing = await getComment(id);
  if (existing.status === "published") await bumpCount(existing.postType, existing.postId, -1);
  await db.delete(comments).where(eq(comments.id, id));
  return { id };
}

export async function setCommentsStatus(
  user: SessionUser,
  ids: number[],
  status: string,
): Promise<number[]> {
  if (!can(user.role, "content:update:any")) throw new ForbiddenError();
  const ok: number[] = [];
  for (const id of ids) {
    const existing = await db.select().from(comments).where(eq(comments.id, id)).then((r) => r[0]);
    if (!existing) continue;
    await db.update(comments).set({ status: status as Comment["status"] }).where(eq(comments.id, id));
    if (status === "published" && existing.status !== "published")
      await bumpCount(existing.postType, existing.postId, 1);
    if (existing.status === "published" && status !== "published")
      await bumpCount(existing.postType, existing.postId, -1);
    ok.push(id);
  }
  return ok;
}

export async function deleteComments(user: SessionUser, ids: number[]): Promise<number[]> {
  if (!can(user.role, "content:delete:any")) throw new ForbiddenError();
  const ok: number[] = [];
  for (const id of ids) {
    const existing = await db.select().from(comments).where(eq(comments.id, id)).then((r) => r[0]);
    if (!existing) continue;
    if (existing.status === "published") await bumpCount(existing.postType, existing.postId, -1);
    await db.delete(comments).where(eq(comments.id, id));
    ok.push(id);
  }
  return ok;
}
