import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Block } from "@/lib/blocks";

/**
 * Roles follow the classic CMS role model (WordPress / Strapi style):
 *  - admin:   full control over everything
 *  - editor:  manage all content + media, but not users/settings
 *  - author:  manage own content only
 *  - subscriber: read-only (can be extended for comments/membership later)
 */
export const roleEnum = pgEnum("role", ["admin", "editor", "author", "subscriber"]);

export const statusEnum = pgEnum("status", ["draft", "published", "archived"]);

/** Per-post/page comment switch: open (anyone can comment) or closed. */
export const commentStatusEnum = pgEnum("comment_status", ["open", "closed"]);

/** Moderation state of a single comment. */
export const commentStateEnum = pgEnum("comment_state", ["published", "pending", "spam"]);

/**
 * Post formats (WordPress "post formats" / Tumblr-style). The theme decides how
 * each format is presented; `standard` is the normal article layout.
 */
export const postFormatEnum = pgEnum("post_format", [
  "standard",
  "aside",
  "quote",
  "link",
  "image",
  "gallery",
  "video",
  "audio",
  "status",
]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("author"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    /** Mobile number (E.164-ish, admin/self editable); multiple NULLs are allowed. */
    phone: text("phone"),
    /** "active" | "banned" — banned users cannot start a session. */
    status: text("status").notNull().default("active"),
    emailVerified: boolean("email_verified").notNull().default(false),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ phoneIdx: uniqueIndex("users_phone_idx").on(t.phone) }),
);

/**
 * Third-party OAuth identities (QQ / WeChat / GitHub / …). One user may own
 * many rows (one account, multiple login methods); each (provider, openId)
 * pair resolves to exactly one local user.
 */
export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Provider key: "github" | "qq" | "wechat" | "custom:<slug>" … */
    provider: text("provider").notNull(),
    /** Stable external account id (openid / unionid / node_id). */
    openId: text("open_id").notNull(),
    /** Cached profile fields, refreshed on each login. */
    nickname: text("nickname"),
    avatarUrl: text("avatar_url"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => ({
    providerOpenIdx: uniqueIndex("oauth_identities_provider_open_idx").on(
      t.provider,
      t.openId,
    ),
    userIdx: index("oauth_identities_user_idx").on(t.userId),
  }),
);

/**
 * Short-lived verification codes (email/SMS): registration, login, password
 * reset, binding. Only the SHA-256 hash of the code is stored.
 */
export const verifyCodes = pgTable(
  "verify_codes",
  {
    id: serial("id").primaryKey(),
    /** Delivery target: email address or phone number. */
    target: text("target").notNull(),
    /** "email" | "sms" */
    channel: text("channel").notNull(),
    /** "register" | "login" | "reset" | "bind" | … */
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ targetIdx: index("verify_codes_target_idx").on(t.target, t.purpose) }),
);

// Reusable content columns shared by posts and pages.
const contentColumns = {
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  // Block-based visual content (Gutenberg/Sanity-like).
  content: jsonb("content").$type<Block[]>().notNull().default([]),
  status: statusEnum("status").notNull().default("draft"),
  featuredImage: text("featured_image"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  /** Comma-separated SEO keywords for this entry. */
  seoKeywords: text("seo_keywords"),
  // Comments: open/closed switch + denormalized count for fast listing.
  commentStatus: commentStatusEnum("comment_status").notNull().default("open"),
  commentsCount: integer("comments_count").notNull().default(0),
  // Total reads (incremented on each public view).
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    ...contentColumns,
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // --- Presentation & organisation (WordPress/Typecho parity) ---
    /** Post format hint for the theme (standard / quote / video / …). */
    format: postFormatEnum("format").notNull().default("standard"),
    /** Sticky: pinned to the top of listings. */
    pinned: boolean("pinned").notNull().default(false),
    /** Optional theme template override (theme-defined key). */
    template: text("template"),
    /** Extra per-format payload: quote source, link target, video embed, … */
    formatMeta: jsonb("format_meta").$type<Record<string, string>>().notNull().default({}),
    // Total likes (incremented by the public post-like action).
    likes: integer("likes").notNull().default(0),
    // --- M2 configurable permalinks ---
    // Persisted pinyin / initials tails so /blog/ni-hao-shijie reverses to a
    // post via an indexed lookup. Populated on create/update; NULL only for
    // pre-migration rows (backfilled once when permalink settings are saved).
    pinyinSlug: text("pinyin_slug"),
    initialSlug: text("initial_slug"),
  },
  (t) => ({
    slugIdx: uniqueIndex("posts_slug_idx").on(t.slug),
    statusIdx: index("posts_status_idx").on(t.status),
    pinnedIdx: index("posts_pinned_idx").on(t.pinned),
    pinyinIdx: uniqueIndex("posts_pinyin_slug_idx").on(t.pinyinSlug),
    initialIdx: uniqueIndex("posts_initial_slug_idx").on(t.initialSlug),
  }),
);

export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    ...contentColumns,
    // Optional parent for hierarchical pages.
    parentId: integer("parent_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Optional theme template override (theme-defined key). */
    template: text("template"),
    /** Menu order for hierarchical navigation output. */
    order: integer("order").notNull().default(0),
  },
  (t) => ({
    slugIdx: uniqueIndex("pages_slug_idx").on(t.slug),
    statusIdx: index("pages_status_idx").on(t.status),
  }),
);

export const media = pgTable(
  "media",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt"),
    uploadedById: integer("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ mimeIdx: index("media_mime_idx").on(t.mimeType) }),
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // Lucide icon identifier (kebab-case, e.g. "folder-open"); null = default icon.
    icon: text("icon"),
    // Self-reference intentionally kept as a plain integer to avoid a
    // circular type-inference cycle; integrity is maintained in the service layer.
    parentId: integer("parent_id"),
    // Manual sort position within the same parent; used by drag-to-reorder.
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ slugIdx: uniqueIndex("categories_slug_idx").on(t.slug) }),
);

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => ({ slugIdx: uniqueIndex("tags_slug_idx").on(t.slug) }),
);

export const postTags = pgTable(
  "post_tags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: uniqueIndex("post_tags_pk").on(t.postId, t.tagId) }),
);

export const postCategories = pgTable(
  "post_categories",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: uniqueIndex("post_categories_pk").on(t.postId, t.categoryId) }),
);

/**
 * Comments. Hierarchical (parent_id) with a moderation state. A null `userId`
 * means a guest comment (name/email/url captured at submit time).
 */
export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    // Posts and pages both accept comments — resolved at the service layer.
    postId: integer("post_id").notNull(),
    postType: text("post_type").notNull().default("post"),
    parentId: integer("parent_id"),
    userId: integer("user_id"),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    authorUrl: text("author_url"),
    content: text("content").notNull(),
    status: commentStateEnum("status").notNull().default("pending"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postIdx: index("comments_post_idx").on(t.postId, t.postType),
    statusIdx: index("comments_status_idx").on(t.status),
  }),
);

/**
 * Navigation menus. Each row is one "location" (header / footer) holding an
 * ordered, hierarchical list of items (header / footer nav).
 */
export const menus = pgTable("menus", {
  id: serial("id").primaryKey(),
  // Logical location used by the theme: "header" | "footer" | …
  location: text("location").notNull().unique(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const menuItems = pgTable(
  "menu_items",
  {
    id: serial("id").primaryKey(),
    menuId: integer("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    order: integer("order").notNull().default(0),
    // custom | post | page | category | tag | external
    type: text("type").notNull().default("custom"),
    label: text("label").notNull(),
    url: text("url").notNull().default(""),
    referenceId: integer("reference_id"),
    referenceSlug: text("reference_slug"),
    target: text("target").notNull().default("_self"),
    // Optional lucide icon name (kebab-case) shown next to the label by themes.
    icon: text("icon"),
  },
  (t) => ({ menuIdx: index("menu_items_menu_idx").on(t.menuId) }),
);

/** Free-form custom fields attached to a post or page (wp_postmeta style). */
export const postMetas = pgTable(
  "post_metas",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
  },
  (t) => ({ postIdx: index("post_metas_post_idx").on(t.postId) }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OauthIdentity = typeof oauthIdentities.$inferSelect;
export type VerifyCode = typeof verifyCodes.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type ContentStatus = (typeof statusEnum.enumValues)[number];

/**
 * Site settings — a single-row singleton (id is always 1) holding the public
 * site identity and the active theme. The first-run setup screen populates it.
 */
export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey(),
  siteTitle: text("site_title").notNull().default("OboePress"),
  siteDescription: text("site_description")
    .notNull()
    .default("一个 Serverless 友好的内容管理系统"),
  tagline: text("tagline"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  // Slug of the theme currently applied to the public site.
  activeThemeSlug: text("active_theme_slug").notNull().default("default"),
  footerText: text("footer_text"),
  // --- Comment settings ---
  commentsEnabled: boolean("comments_enabled").notNull().default(true),
  requireNameEmail: boolean("require_name_email").notNull().default(false),
  commentModeration: boolean("comment_moderation").notNull().default(false),
  commentModerationWords: text("comment_moderation_words").notNull().default(""),
  /** Prefilled text in the built-in comment box (visitor can edit freely). */
  commentDefaultContent: text("comment_default_content").notNull().default(""),

  // --- Comment provider: builtin | artalk | giscus | waline | twikoo | disqus | utterances | none ---
  commentProvider: text("comment_provider").notNull().default("builtin"),
  artalkServer: text("artalk_server").notNull().default(""),
  artalkSite: text("artalk_site").notNull().default(""),
  giscusRepo: text("giscus_repo").notNull().default(""),
  giscusRepoId: text("giscus_repo_id").notNull().default(""),
  giscusCategory: text("giscus_category").notNull().default("General"),
  giscusCategoryId: text("giscus_category_id").notNull().default(""),
  giscusMapping: text("giscus_mapping").notNull().default("pathname"),
  giscusReactions: boolean("giscus_reactions").notNull().default(true),
  giscusTheme: text("giscus_theme").notNull().default(""),
  walineServer: text("waline_server").notNull().default(""),
  twikooEnvId: text("twikoo_env_id").notNull().default(""),
  disqusShortname: text("disqus_shortname").notNull().default(""),
  utterancesRepo: text("utterances_repo").notNull().default(""),
  utterancesTerm: text("utterances_term").notNull().default("pathname"),

  // --- Avatar source for built-in comments ---
  avatarSource: text("avatar_source").notNull().default("gravatar"),
  avatarSize: integer("avatar_size").notNull().default(80),
  avatarDefault: text("avatar_default").notNull().default("identicon"),
  avatarRating: text("avatar_rating").notNull().default("g"),

  // --- Reading settings (WordPress「阅读设置」/ Hexo per_page) ---
  /** "latest" = newest posts on the home page, "page" = a static front page. */
  homeDisplay: text("home_display").notNull().default("latest"),
  /** Page id used as the front page when homeDisplay = "page". */
  homePageId: integer("home_page_id"),
  /** Page id used to list posts when homeDisplay = "page". */
  postsPageId: integer("posts_page_id"),
  postsPerPage: integer("posts_per_page").notNull().default(10),
  feedItems: integer("feed_items").notNull().default(20),
  /** Feed/excerpt mode: "excerpt" | "full". */
  feedContent: text("feed_content").notNull().default("excerpt"),
  excerptLength: integer("excerpt_length").notNull().default(160),

  // --- SEO defaults ---
  /** e.g. "%title% - %site%" */
  seoTitleTemplate: text("seo_title_template").notNull().default("%title% - %site%"),
  seoKeywords: text("seo_keywords").notNull().default(""),
  seoDefaultDescription: text("seo_default_description").notNull().default(""),
  /** robots directive for the whole site, e.g. "index,follow" or "noindex". */
  seoRobots: text("seo_robots").notNull().default("index,follow"),
  ogImageUrl: text("og_image_url"),
  twitterCard: text("twitter_card").notNull().default("summary_large_image"),
  twitterSite: text("twitter_site"),
  /** Verification meta values for search consoles. */
  verifications: jsonb("verifications").$type<Record<string, string>>().notNull().default({}),

  // --- Injection / analytics ---
  customHead: text("custom_head").notNull().default(""),
  customFooter: text("custom_footer").notNull().default(""),
  customCss: text("custom_css").notNull().default(""),
  analyticsId: text("analytics_id"),
  icpNumber: text("icp_number"),

  // --- Social / contact links used by themes ---
  socialLinks: jsonb("social_links").$type<SocialLink[]>().notNull().default([]),
  /** Footer link row: text may contain HTML, image is an optional 16px icon. */
  footerLinks: jsonb("footer_links").$type<FooterLink[]>().notNull().default([]),

  /** Timezone + date format used when rendering dates on the public site. */
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  dateFormat: text("date_format").notNull().default("YYYY-MM-DD"),
  language: text("language").notNull().default("zh-CN"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SocialLink = { label: string; url: string; icon?: string };

export type FooterLink = { text: string; url: string; image?: string };

/**
 * Generic key/value option store.
 * Anything that does not deserve its own column lands here: active plugin list,
 * per-plugin settings, feature flags, cached counters, …
 */
export const options = pgTable(
  "options",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<unknown>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ keyIdx: uniqueIndex("options_key_idx").on(t.key) }),
);

/**
 * Installed plugins. Rows are discovered from the plugins/ directory on
 * bootstrap; `enabled` + `settings` are the user-owned part.
 */
export const plugins = pgTable(
  "plugins",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    version: text("version").notNull().default("1.0.0"),
    author: text("author").notNull().default(""),
    enabled: boolean("enabled").notNull().default(false),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ slugIdx: uniqueIndex("plugins_slug_idx").on(t.slug) }),
);

/**
 * Widgets ("主题模块" / "小工具"). Each row is one
 * widget instance placed into a named area declared by the active theme.
 */
export const widgets = pgTable(
  "widgets",
  {
    id: serial("id").primaryKey(),
    /** Theme-declared area key: "sidebar" | "footer-1" | … */
    area: text("area").notNull(),
    /** Registered widget type key: "recent-posts" | "text" | … */
    type: text("type").notNull(),
    title: text("title").notNull().default(""),
    order: integer("order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** Scope the placement to one theme so switching themes keeps both layouts. */
    themeSlug: text("theme_slug").notNull().default(""),
  },
  (t) => ({ areaIdx: index("widgets_area_idx").on(t.themeSlug, t.area) }),
);

/**
 * Themes. Each theme is a named bundle of CSS custom properties (colors,
 * radius, font, …). The public site reads the active theme and injects
 * its variables. `isDefault` marks the built-in OboePress theme.
 */
export const themes = pgTable(
  "themes",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    // Design tokens (colors / typography / layout) consumed as CSS variables.
    config: jsonb("config").$type<ThemeConfig>().notNull().default({}),
    /**
     * Free-form, theme-specific settings driven by the theme's own
     * `settingsSchema` in manifest.json — this is what makes a theme's options
     * panel go far beyond colors (layout, components, hero, membership, …).
     */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ slugIdx: uniqueIndex("themes_slug_idx").on(t.slug) }),
);

export type SiteSettings = typeof siteSettings.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Menu = typeof menus.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type PostMeta = typeof postMetas.$inferSelect;

/**
 * Design tokens exposed to the theme editor. Every key is emitted as a CSS
 * custom property on `:root`, so a theme's stylesheet consumes them directly
 * (`var(--accent)`), and users can retheme without touching code.
 */
export type ThemeConfig = {
  // --- Palette ---
  background?: string;
  surface?: string;
  surfaceAlt?: string;
  text?: string;
  muted?: string;
  accent?: string;
  accentText?: string;
  accentSoft?: string;
  border?: string;
  link?: string;
  linkHover?: string;
  success?: string;
  warning?: string;
  danger?: string;
  headerBg?: string;
  footerBg?: string;
  codeBg?: string;

  // --- Shape & motion ---
  radius?: string;
  radiusLarge?: string;
  borderWidth?: string;
  shadow?: string;
  transition?: string;

  // --- Typography ---
  font?: string;
  fontHeading?: string;
  fontMono?: string;
  fontSize?: string;
  lineHeight?: string;
  letterSpacing?: string;
  headingWeight?: string;

  // --- Layout ---
  /** Max width of the outer container, e.g. "1200px". */
  containerWidth?: string;
  /** Max width of the article column, e.g. "760px". */
  contentWidth?: string;
  /** "none" | "left" | "right" */
  sidebar?: string;
  /** Vertical rhythm multiplier: "compact" | "normal" | "relaxed" */
  density?: string;
  /** Post list style: "list" | "card" | "grid" | "magazine" | "timeline" */
  listStyle?: string;
  /** Columns used by grid/card listings. */
  gridColumns?: string;
  /** Header behaviour: "static" | "sticky" | "float" */
  headerMode?: string;

  // --- Effects ---
  /** "on" | "off" — frosted-glass surfaces. */
  glass?: string;
  glassBlur?: string;
  /** "on" | "off" — subtle grain overlay. */
  noise?: string;
  /** CSS gradient used for hero / accents. */
  gradient?: string;

  // --- Escape hatch ---
  customCss?: string;
};

export type Option = typeof options.$inferSelect;
export type Plugin = typeof plugins.$inferSelect;
export type Widget = typeof widgets.$inferSelect;
export type PostFormat = (typeof postFormatEnum.enumValues)[number];

