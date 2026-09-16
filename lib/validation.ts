import { z } from "zod";

/** Zod schema for the block-based content (shared by REST + GraphQL). */
export const blockSchema = z.union([
  z.object({
    id: z.string(),
    type: z.literal("heading"),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    text: z.string(),
  }),
  z.object({ id: z.string(), type: z.literal("paragraph"), text: z.string() }),
  z.object({
    id: z.string(),
    type: z.literal("image"),
    url: z.string(),
    alt: z.string().optional(),
    caption: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("quote"),
    text: z.string(),
    cite: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("code"),
    language: z.string().optional(),
    code: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("list"),
    ordered: z.boolean().default(false),
    items: z.array(z.string()),
  }),
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({ id: z.string(), type: z.literal("html"), html: z.string() }),
]);

export const contentSchema = z.array(blockSchema).default([]);

/** ISO 日期字符串，用于显式指定发布/创建时间（例如历史文章迁移）。 */
const publishedAtSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "publishedAt 必须是合法的时间字符串",
  })
  .optional();

export const postInputSchema = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional(),
  content: contentSchema,
  status: z.enum(["draft", "published", "archived"]).optional(),
  publishedAt: publishedAtSchema,
  featuredImage: z.string().max(500).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(300).optional(),
  commentStatus: z.enum(["open", "closed"]).optional(),
  authorId: z.number().int().positive().optional(),
  categoryIds: z.array(z.number().int()).default([]),
  tagIds: z.array(z.number().int()).default([]),
  metas: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  /** Post format hint (standard / aside / quote / link / image / …). */
  format: z
    .enum(["standard", "aside", "quote", "link", "image", "gallery", "video", "audio", "status"])
    .optional(),
  /** Per-format payload: quote source, link target, video embed, … */
  formatMeta: z.record(z.string(), z.string()).optional(),
  /** Sticky / pinned to top of listings. */
  pinned: z.boolean().optional(),
  /** Theme template override (theme-defined key). */
  template: z.string().max(60).optional(),
});

export const pageInputSchema = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional(),
  content: contentSchema,
  status: z.enum(["draft", "published", "archived"]).optional(),
  publishedAt: publishedAtSchema,
  featuredImage: z.string().max(500).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(300).optional(),
  commentStatus: z.enum(["open", "closed"]).optional(),
  parentId: z.number().int().positive().optional(),
  categoryIds: z.array(z.number().int()).default([]),
  tagIds: z.array(z.number().int()).default([]),
  metas: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  parentId: z.number().int().positive().optional(),
});

export const tagInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(120).optional(),
});

export const categoryReorderItemSchema = z.object({
  id: z.number().int().positive(),
  parentId: z.number().int().positive().nullable(),
  order: z.number().int().nonnegative(),
});
export const categoryReorderSchema = z.object({
  items: z.array(categoryReorderItemSchema).min(1),
});

export const userInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "editor", "author", "subscriber"]).optional(),
  bio: z.string().max(500).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** A logged-in user changing their own password (requires current password). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/** First-run setup: create the initial admin + site identity. */
export const setupSchema = z.object({
  siteTitle: z.string().min(1).max(120).optional(),
  siteDescription: z.string().max(300).optional(),
  tagline: z.string().max(120).optional(),
  footerText: z.string().max(200).optional(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
});

/** `{label,url,icon?}` rows produced by the `links` field type. */
const socialLinkSchema = z.object({
  label: z.string().max(60).default(""),
  url: z.string().max(500).default(""),
  icon: z.string().max(60).optional(),
});

/** Blank selects arrive as "" — treat that as "no page selected". */
const nullableId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);

export const siteSettingsSchema = z.object({
  // General
  siteTitle: z.string().min(1).max(120).optional(),
  siteDescription: z.string().max(1000).optional(),
  tagline: z.string().max(200).optional(),
  logoUrl: z.string().max(500).optional(),
  faviconUrl: z.string().max(500).optional(),
  footerText: z.string().max(500).optional(),
  activeThemeSlug: z.string().max(60).optional(),
  icpNumber: z.string().max(120).optional(),
  socialLinks: z.array(socialLinkSchema).max(30).optional(),

  // Comments
  commentsEnabled: z.boolean().optional(),
  requireNameEmail: z.boolean().optional(),
  commentModeration: z.boolean().optional(),
  commentModerationWords: z.string().max(2000).optional(),

  // Comment provider (builtin / artalk / giscus / waline / twikoo / disqus / utterances / none)
  commentProvider: z
    .enum(["builtin", "artalk", "giscus", "waline", "twikoo", "disqus", "utterances", "none"])
    .optional(),
  artalkServer: z.string().max(500).optional(),
  artalkSite: z.string().max(200).optional(),
  giscusRepo: z.string().max(200).optional(),
  giscusRepoId: z.string().max(200).optional(),
  giscusCategory: z.string().max(200).optional(),
  giscusCategoryId: z.string().max(200).optional(),
  giscusMapping: z
    .enum(["pathname", "url", "title", "og-desc", "issue-number", "specific-term"])
    .optional(),
  giscusReactions: z.boolean().optional(),
  giscusTheme: z.string().max(100).optional(),
  walineServer: z.string().max(500).optional(),
  twikooEnvId: z.string().max(300).optional(),
  disqusShortname: z.string().max(100).optional(),
  utterancesRepo: z.string().max(200).optional(),
  utterancesTerm: z.enum(["pathname", "url", "title", "issue-number", "og-desc"]).optional(),

  // Avatar source for built-in comments
  avatarSource: z
    .enum(["gravatar", "cn-gravatar", "cravatar", "weavatar", "libravatar", "qq", "none"])
    .optional(),
  avatarSize: z.coerce.number().int().min(16).max(300).optional(),
  avatarDefault: z.string().max(40).optional(),
  avatarRating: z.enum(["g", "pg", "r", "x"]).optional(),

  // Reading
  homeDisplay: z.enum(["latest", "page"]).optional(),
  homePageId: nullableId.optional(),
  postsPageId: nullableId.optional(),
  postsPerPage: z.coerce.number().int().min(1).max(100).optional(),
  feedItems: z.coerce.number().int().min(1).max(100).optional(),
  feedContent: z.enum(["excerpt", "full"]).optional(),
  excerptLength: z.coerce.number().int().min(20).max(1000).optional(),

  // SEO
  seoTitleTemplate: z.string().max(200).optional(),
  seoKeywords: z.string().max(500).optional(),
  seoDefaultDescription: z.string().max(1000).optional(),
  seoRobots: z.string().max(60).optional(),
  ogImageUrl: z.string().max(500).optional(),
  twitterCard: z.enum(["summary", "summary_large_image"]).optional(),
  twitterSite: z.string().max(60).optional(),
  verifications: z.record(z.string().max(300)).optional(),

  // Injection
  customHead: z.string().max(20000).optional(),
  customFooter: z.string().max(20000).optional(),
  customCss: z.string().max(50000).optional(),
  analyticsId: z.string().max(120).optional(),

  // Locale
  timezone: z.string().max(60).optional(),
  dateFormat: z.string().max(40).optional(),
  language: z.string().max(20).optional(),
});

export const commentInputSchema = z.object({
  postId: z.number().int().positive(),
  postType: z.enum(["post", "page"]).optional(),
  parentId: z.number().int().positive().optional(),
  authorName: z.string().min(1).max(60),
  authorEmail: z.string().email().max(120).optional(),
  authorUrl: z.string().max(300).optional(),
  content: z.string().min(1).max(2000),
});

export const menuItemSchema = z.object({
  id: z.number().int().optional(),
  parentId: z.number().int().nullable().optional(),
  order: z.number().int().optional(),
  type: z.string().max(20).optional(),
  label: z.string().min(1).max(80),
  url: z.string().max(500),
  referenceSlug: z.string().nullable().optional(),
  target: z.string().max(20).optional(),
});

export const menuInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  items: z.array(menuItemSchema).optional(),
});

export const themeInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(60).optional(),
  config: z
    .object({
      background: z.string().optional(),
      surface: z.string().optional(),
      text: z.string().optional(),
      muted: z.string().optional(),
      accent: z.string().optional(),
      accentText: z.string().optional(),
      border: z.string().optional(),
      radius: z.string().optional(),
      font: z.string().optional(),
    })
    .optional(),
});

export type PostInput = z.infer<typeof postInputSchema>;
export type PageInput = z.infer<typeof pageInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type TagInput = z.infer<typeof tagInputSchema>;
export type UserInput = z.infer<typeof userInputSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
export type ThemeInput = z.infer<typeof themeInputSchema>;
export type CommentInput = z.infer<typeof commentInputSchema>;
export type MenuItemInput = z.infer<typeof menuItemSchema>;
export type MenuInput = z.infer<typeof menuInputSchema>;
