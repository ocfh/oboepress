import { GraphQLScalarType, GraphQLError, Kind } from "graphql";
import { createSchema } from "graphql-yoga";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionFromRequest, signSession, verifyCredentials } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth";
import { ServiceError } from "@/lib/services/errors";
import * as postSvc from "@/lib/services/posts";
import * as pageSvc from "@/lib/services/pages";
import * as taxSvc from "@/lib/services/taxonomies";
import * as mediaSvc from "@/lib/services/media";
import * as userSvc from "@/lib/services/users";
import type { PostInput, PageInput, CategoryInput, TagInput } from "@/lib/validation";

// ---- Custom scalars ----

const JSONScalar: GraphQLScalarType = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral(ast): unknown {
    switch (ast.kind) {
      case Kind.STRING:
        return ast.value;
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
        return parseInt(ast.value, 10);
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.NULL:
        return null;
      case Kind.LIST:
        return ast.values.map((n) => JSONScalar.parseLiteral(n));
      case Kind.OBJECT: {
        const obj: Record<string, unknown> = {};
        ast.fields.forEach((f) => {
          obj[f.name.value] = JSONScalar.parseLiteral(f.value);
        });
        return obj;
      }
      default:
        return null;
    }
  },
});

const DateTimeScalar: GraphQLScalarType = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO-8601 datetime string",
  serialize: (v: unknown) =>
    v instanceof Date ? v.toISOString() : v == null ? null : String(v),
  parseValue: (v) => (typeof v === "string" ? new Date(v) : null),
  parseLiteral(ast): unknown {
    if (ast.kind === Kind.STRING) return new Date(ast.value);
    return null;
  },
});

// ---- Type definitions ----

const typeDefs = /* GraphQL */ `
  scalar JSON
  scalar DateTime

  type User {
    id: Int!
    email: String!
    name: String!
    role: String!
    bio: String
    avatarUrl: String
    createdAt: DateTime
  }

  type Category {
    id: Int!
    name: String!
    slug: String!
    description: String
    icon: String
    parentId: Int
  }

  type Tag {
    id: Int!
    name: String!
    slug: String!
  }

  type Media {
    id: Int!
    filename: String!
    url: String!
    mimeType: String!
    size: Int!
    alt: String
    createdAt: DateTime
  }

  type Post {
    id: Int!
    title: String!
    slug: String!
    excerpt: String
    content: JSON!
    status: String!
    featuredImage: String
    seoTitle: String
    seoDescription: String
    seoKeywords: String
    author: User
    categories: [Category!]!
    tags: [Tag!]!
    publishedAt: DateTime
    createdAt: DateTime
    updatedAt: DateTime
  }

  type Page {
    id: Int!
    title: String!
    slug: String!
    excerpt: String
    content: JSON!
    status: String!
    featuredImage: String
    seoTitle: String
    seoDescription: String
    seoKeywords: String
    parentId: Int
    publishedAt: DateTime
    createdAt: DateTime
    updatedAt: DateTime
  }

  type PostList {
    items: [Post!]!
    total: Int!
  }
  type PageList {
    items: [Page!]!
    total: Int!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input PostInput {
    title: String!
    slug: String
    excerpt: String
    content: JSON
    status: String
    featuredImage: String
    seoTitle: String
    seoDescription: String
    seoKeywords: String
    authorId: Int
    categoryIds: [Int!]
    tagIds: [Int!]
  }

  input PageInput {
    title: String!
    slug: String
    excerpt: String
    content: JSON
    status: String
    featuredImage: String
    seoTitle: String
    seoDescription: String
    seoKeywords: String
    parentId: Int
    categoryIds: [Int!]
    tagIds: [Int!]
  }

  input CategoryInput {
    name: String!
    slug: String
    description: String
    parentId: Int
  }

  input TagInput {
    name: String!
    slug: String
  }

  type Query {
    me: User
    posts(
      status: String
      authorId: Int
      categoryId: Int
      tagId: Int
      limit: Int
      offset: Int
    ): PostList!
    post(id: Int!): Post
    postBySlug(slug: String!): Post
    pages(status: String, limit: Int, offset: Int): PageList!
    page(id: Int!): Page
    pageBySlug(slug: String!): Page
    categories: [Category!]!
    category(id: Int!): Category
    tags: [Tag!]!
    tag(id: Int!): Tag
    media(limit: Int): [Media!]!
    users: [User!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    createPost(input: PostInput!): Post!
    updatePost(id: Int!, input: PostInput!): Post!
    deletePost(id: Int!): Boolean!
    createPage(input: PageInput!): Page!
    updatePage(id: Int!, input: PageInput!): Page!
    deletePage(id: Int!): Boolean!
    createCategory(input: CategoryInput!): Category!
    updateCategory(id: Int!, input: CategoryInput!): Category!
    deleteCategory(id: Int!): Boolean!
    createTag(input: TagInput!): Tag!
    updateTag(id: Int!, input: TagInput!): Tag!
    deleteTag(id: Int!): Boolean!
  }
`;

// ---- Helpers ----

type Ctx = { user: SessionUser | null };

function requireUser(ctx: Ctx): SessionUser {
  if (!ctx.user) throw new GraphQLError("未认证", { extensions: { code: "UNAUTHENTICATED" } });
  return ctx.user;
}

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((e) => {
    if (e instanceof ServiceError)
      throw new GraphQLError(e.message, {
        extensions: { code: "ERROR", http: { status: e.status } },
      });
    throw e;
  });
}

// ---- Resolvers ----

export const schema = createSchema<Ctx>({
  typeDefs,
  resolvers: {
    JSON: JSONScalar,
    DateTime: DateTimeScalar,
    Query: {
      me: async (_p, _a, ctx) => {
        if (!ctx.user) return null;
        const [row] = await db
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id));
        if (!row) return null;
        const { passwordHash, ...rest } = row;
        return rest;
      },
      posts: (_p, args, ctx) =>
        wrap(() =>
          postSvc.listPosts({
            status: ctx.user ? args.status : "published",
            authorId: args.authorId,
            categoryId: args.categoryId,
            tagId: args.tagId,
            limit: args.limit ?? 20,
            offset: args.offset ?? 0,
          }),
        ),
      post: (_p, { id }, ctx) =>
        wrap(() => postSvc.getPostById(id, !!ctx.user)),
      postBySlug: (_p, { slug }, ctx) =>
        wrap(() => postSvc.getPostBySlug(slug, !!ctx.user)),
      pages: (_p, args, ctx) =>
        wrap(() =>
          pageSvc.listPages({
            status: ctx.user ? args.status : "published",
            limit: args.limit ?? 20,
            offset: args.offset ?? 0,
          }),
        ),
      page: (_p, { id }, ctx) => wrap(() => pageSvc.getPageById(id, !!ctx.user)),
      pageBySlug: (_p, { slug }, ctx) =>
        wrap(() => pageSvc.getPageBySlug(slug, !!ctx.user)),
      categories: () => wrap(() => taxSvc.listCategories()),
      category: (_p, { id }) => wrap(() => taxSvc.getCategory(id)),
      tags: () => wrap(() => taxSvc.listTags()),
      tag: (_p, { id }) => wrap(() => taxSvc.getTag(id)),
      media: (_p, { limit }) => wrap(() => mediaSvc.listMedia(limit ?? 50)),
      users: (_p, _a, ctx) => wrap(() => userSvc.listUsers(requireUser(ctx))),
    },
    Mutation: {
      login: async (_p, { email, password }) => {
        const user = await verifyCredentials(email, password);
        if (!user) throw new GraphQLError("邮箱或密码错误", { extensions: { code: "UNAUTHENTICATED" } });
        const token = await signSession(user);
        return { token, user };
      },
      createPost: (_p, { input }, ctx) =>
        wrap(() => postSvc.createPost(requireUser(ctx), input as PostInput)),
      updatePost: (_p, { id, input }, ctx) =>
        wrap(() => postSvc.updatePost(requireUser(ctx), id, input as PostInput)),
      deletePost: (_p, { id }, ctx) =>
        wrap(() => postSvc.deletePost(requireUser(ctx), id).then(() => true)),
      createPage: (_p, { input }, ctx) =>
        wrap(() => pageSvc.createPage(requireUser(ctx), input as PageInput)),
      updatePage: (_p, { id, input }, ctx) =>
        wrap(() => pageSvc.updatePage(requireUser(ctx), id, input as PageInput)),
      deletePage: (_p, { id }, ctx) =>
        wrap(() => pageSvc.deletePage(requireUser(ctx), id).then(() => true)),
      createCategory: (_p, { input }, ctx) =>
        wrap(() => taxSvc.createCategory(requireUser(ctx), input as CategoryInput)),
      updateCategory: (_p, { id, input }, ctx) =>
        wrap(() => taxSvc.updateCategory(requireUser(ctx), id, input as CategoryInput)),
      deleteCategory: (_p, { id }, ctx) =>
        wrap(() => taxSvc.deleteCategory(requireUser(ctx), id).then(() => true)),
      createTag: (_p, { input }, ctx) =>
        wrap(() => taxSvc.createTag(requireUser(ctx), input as TagInput)),
      updateTag: (_p, { id, input }, ctx) =>
        wrap(() => taxSvc.updateTag(requireUser(ctx), id, input as TagInput)),
      deleteTag: (_p, { id }, ctx) =>
        wrap(() => taxSvc.deleteTag(requireUser(ctx), id).then(() => true)),
    },
  },
});

export async function buildContext(req: Request): Promise<Ctx> {
  const user = await getSessionFromRequest(req);
  return { user };
}
