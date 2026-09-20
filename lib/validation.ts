import { z } from "zod";
import { isValidLucideIconName } from "./icon-names";

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
    // 可选提示标题：填写后前端渲染为带灯泡图标的提示块
    title: z.string().optional(),
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
  seoKeywords: z.string().max(500).optional(),
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
  seoKeywords: z.string().max(500).optional(),
  commentStatus: z.enum(["open", "closed"]).optional(),
  parentId: z.number().int().positive().optional(),
  categoryIds: z.array(z.number().int()).default([]),
  tagIds: z.array(z.number().int()).default([]),
  metas: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

/** Optional Lucide icon identifier (kebab-case); empty string / null clears it. */
export const categoryIconSchema = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "图标标识符格式不正确")
    .refine((v) => isValidLucideIconName(v), "不是内置图标标识符，请到「图标库」核对")
    .nullable()
    .optional(),
);

/** 分类/标签共用的 SEO 三项；空串与 null 都表示清除（service 层归一为 null）。 */
const taxonomySeoShape = {
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(300).nullable().optional(),
  seoKeywords: z.string().max(500).nullable().optional(),
};

export const categoryInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  parentId: z.number().int().positive().optional(),
  icon: categoryIconSchema,
  ...taxonomySeoShape,
});

export const tagInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(120).optional(),
  ...taxonomySeoShape,
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
  // 邮箱或昵称：含 @ 按邮箱查，否则按昵称查（大小写不敏感）。
  account: z.string().trim().min(1).max(200),
  password: z.string().min(1),
  // 图形验证码答案或自定义验证码凭证；是否校验由服务端安全配置决定。
  captcha: z.string().trim().max(200).optional(),
});

/**
 * 前台自助注册。字段是否必填由服务端 memberSettings 二次决定（邮箱/手机号
 * 均可选），这里只做与配置无关的通用边界校验。手机号仅去空白，格式由
 * registerMember 统一校验（中国大陆 11 位或 E.164）。
 */
export const registerSchema = z.object({
  // 昵称/密码是否必填由 memberSettings 决定；留空时服务层分别生成昵称、
  // 走免密注册，这里只限制「填了的情况下」的最大长度。
  name: z.string().trim().max(32).optional(),
  email: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().max(200).optional(),
  captcha: z.string().trim().max(200).optional(),
  // 邀请码，是否必需由服务端会员设置（inviteOnly）决定。
  inviteCode: z.string().trim().max(64).optional(),
  // 邮箱 / 手机验证码（6 位），是否必需由服务端通知设置决定。
  emailCode: z.string().trim().max(8).optional(),
  phoneCode: z.string().trim().max(8).optional(),
});

/** 公开获取邮箱/短信验证码（注册码或登录码，缺省按注册码兼容旧前端）。 */
export const sendCodeSchema = z.object({
  channel: z.enum(["email", "sms"]),
  target: z.string().trim().min(3).max(160),
  // bind 为登录态「账号中心」绑定/换绑邮箱、手机专用。
  purpose: z.enum(["register", "login", "bind"]).optional(),
  // 登录场景可能附带图形验证码（按后台安全配置决定是否校验）。
  captcha: z.string().trim().max(200).optional(),
});

/** 邮箱/手机验证码免密登录（通道由通知设置的 login 开关门控）。 */
export const loginCodeSchema = z.object({
  channel: z.enum(["email", "sms"]),
  target: z.string().trim().min(3).max(160),
  code: z.string().trim().min(4).max(8),
  captcha: z.string().trim().max(200).optional(),
});

/** A logged-in user changing their own password (requires current password). */
export const changePasswordSchema = z.object({
  // 纯第三方登录用户没有旧密码，服务层对 nopassword 用户放行空串。
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(200),
});

/** 找回密码第一步：提交账号（邮箱或昵称），向该账号绑定的邮箱发送重置码。 */
export const forgotPasswordSchema = z.object({
  account: z.string().trim().min(1).max(200),
  captcha: z.string().trim().max(200).optional(),
});

/** 找回密码第二步：账号 + 邮箱验证码 + 新密码。 */
export const resetPasswordSchema = z.object({
  account: z.string().trim().min(1).max(200),
  code: z.string().trim().min(4).max(8),
  password: z.string().min(8).max(200),
});

/** 登录第二步：用密码通过后换来的短时票据 + TOTP 动态码/恢复码。 */
export const loginTwoFaSchema = z.object({
  ticket: z.string().min(10).max(2000),
  code: z.string().trim().min(6).max(20),
});

/** 我的账号 → 两步验证自助操作。 */
export const twoFaActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({
    action: z.literal("confirm"),
    code: z.string().trim().min(6).max(20),
  }),
  z.object({
    action: z.literal("regen"),
    code: z.string().trim().min(6).max(20),
  }),
  z.object({
    action: z.literal("disable"),
    password: z.string().min(1).max(200),
  }),
]);

/**
 * A logged-in user editing their own display name + email + phone.
 * 邮箱/手机换绑成新值时，路由层必须消费一枚 purpose=bind 的验证码；
 * phone 传空串表示解绑手机（解绑不要求验证码）。
 */
export const profileSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(120),
  phone: z.string().trim().max(20).optional(),
  emailCode: z.string().trim().min(4).max(8).optional(),
  phoneCode: z.string().trim().min(4).max(8).optional(),
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

/** `{text,url,image?}` rows produced by the `footerLinks` field type. */
const footerLinkSchema = z.object({
  text: z.string().max(300).default(""),
  url: z.string().max(500).default(""),
  image: z.string().max(500).optional(),
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
  footerLinks: z.array(footerLinkSchema).max(20).optional(),

  // Comments
  commentsEnabled: z.boolean().optional(),
  requireNameEmail: z.boolean().optional(),
  commentModeration: z.boolean().optional(),
  commentModerationWords: z.string().max(2000).optional(),
  commentDefaultContent: z.string().max(2000).optional(),

  // Comment provider: built-in form or a third-party widget
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
  // 人机验证插件透传字段（核心不解释语义，由 comment.submission 钩子消费）
  captchaToken: z.string().max(500).optional(),
  captchaAnswer: z.string().max(20).optional(),
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
  icon: z.string().max(100).nullable().optional(),
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
