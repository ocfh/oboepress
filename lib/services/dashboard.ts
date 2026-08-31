import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, pages, media, users, categories, tags, comments } from "@/db/schema";

export type DashboardStats = {
  counts: {
    posts: number;
    pages: number;
    media: number;
    users: number;
    categories: number;
    tags: number;
    comments: number;
    commentsPending: number;
  };
  postStatus: { draft: number; published: number; archived: number };
  recentPosts: { id: number; title: string; status: string; updatedAt: string }[];
  recentComments: {
    id: number;
    authorName: string;
    content: string;
    status: string;
    postTitle: string;
    createdAt: string;
  }[];
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const c = async (t: any, col = "id") =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(t))[0]?.n ?? 0);

  const [postStatusRows] = await db
    .select({
      draft: sql<number>`sum(case when status='draft' then 1 else 0 end)`,
      published: sql<number>`sum(case when status='published' then 1 else 0 end)`,
      archived: sql<number>`sum(case when status='archived' then 1 else 0 end)`,
    })
    .from(posts);

  const [commentRows] = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`sum(case when status='pending' then 1 else 0 end)`,
    })
    .from(comments);

  const recentPosts = await db
    .select({ id: posts.id, title: posts.title, status: posts.status, updatedAt: posts.updatedAt })
    .from(posts)
    .orderBy(desc(posts.updatedAt))
    .limit(6);

  const recentComments = await db
    .select({
      id: comments.id,
      authorName: comments.authorName,
      content: comments.content,
      status: comments.status,
      postId: comments.postId,
      postType: comments.postType,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .orderBy(desc(comments.createdAt))
    .limit(6);

  const postTitles = new Map<number, string>();
  for (const rc of recentComments) {
    if (rc.postType === "page") {
      const [p] = await db.select({ title: pages.title }).from(pages).where(eq(pages.id, rc.postId));
      postTitles.set(rc.postId, p?.title ?? "（已删除）");
    } else {
      const [p] = await db.select({ title: posts.title }).from(posts).where(eq(posts.id, rc.postId));
      postTitles.set(rc.postId, p?.title ?? "（已删除）");
    }
  }

  return {
    counts: {
      posts: Number(postStatusRows?.draft ?? 0) + Number(postStatusRows?.published ?? 0) + Number(postStatusRows?.archived ?? 0),
      pages: await c(pages),
      media: await c(media),
      users: await c(users),
      categories: await c(categories),
      tags: await c(tags),
      comments: Number(commentRows?.total ?? 0),
      commentsPending: Number(commentRows?.pending ?? 0),
    },
    postStatus: {
      draft: Number(postStatusRows?.draft ?? 0),
      published: Number(postStatusRows?.published ?? 0),
      archived: Number(postStatusRows?.archived ?? 0),
    },
    recentPosts: recentPosts.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
    })),
    recentComments: recentComments.map((rc) => ({
      id: rc.id,
      authorName: rc.authorName,
      content: rc.content.slice(0, 80),
      status: rc.status,
      postTitle: postTitles.get(rc.postId) ?? "",
      createdAt: rc.createdAt ? new Date(rc.createdAt).toISOString() : "",
    })),
  };
}
