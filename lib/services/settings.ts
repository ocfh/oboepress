import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  siteSettings,
  type SiteSettings,
  type SocialLink,
  type FooterLink,
} from "@/db/schema";
import { ensureBootstrap } from "./bootstrap";

export type SiteSettingsInput = {
  // General
  siteTitle?: string;
  siteDescription?: string;
  tagline?: string;
  logoUrl?: string;
  faviconUrl?: string;
  footerText?: string;
  activeThemeSlug?: string;
  icpNumber?: string;
  socialLinks?: SocialLink[];
  footerLinks?: FooterLink[];

  // Comments
  commentsEnabled?: boolean;
  requireNameEmail?: boolean;
  commentModeration?: boolean;
  commentModerationWords?: string;
  commentDefaultContent?: string;

  // Comment provider (builtin / artalk / giscus / waline / twikoo / disqus / utterances / none)
  commentProvider?: string;
  artalkServer?: string;
  artalkSite?: string;
  giscusRepo?: string;
  giscusRepoId?: string;
  giscusCategory?: string;
  giscusCategoryId?: string;
  giscusMapping?: string;
  giscusReactions?: boolean;
  giscusTheme?: string;
  walineServer?: string;
  twikooEnvId?: string;
  disqusShortname?: string;
  utterancesRepo?: string;
  utterancesTerm?: string;

  // Avatar source for built-in comments
  avatarSource?: string;
  avatarSize?: number;
  avatarDefault?: string;
  avatarRating?: string;

  // Reading
  homeDisplay?: string;
  homePageId?: number | null;
  postsPageId?: number | null;
  postsPerPage?: number;
  feedItems?: number;
  feedContent?: string;
  excerptLength?: number;

  // SEO
  seoTitleTemplate?: string;
  seoKeywords?: string;
  seoDefaultDescription?: string;
  seoRobots?: string;
  ogImageUrl?: string;
  twitterCard?: string;
  twitterSite?: string;
  verifications?: Record<string, string>;

  // Injection
  customHead?: string;
  customFooter?: string;
  customCss?: string;
  analyticsId?: string;

  // Locale
  timezone?: string;
  dateFormat?: string;
  language?: string;
};

/**
 * 全站设置单行在一次公开渲染中会被 root layout、catch-all、主题 Layout、
 * Sidebar 等读取 4~6 次；React cache 把同请求内的重复查询合并为一条 SQL。
 * 写接口 updateSettings 直接返回更新后的行，不依赖读后写，故请求内缓存
 * 不会让后台保存响应拿到旧值。
 */
export const getSettings = cache(async (): Promise<SiteSettings> => {
  await ensureBootstrap();
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1));
  return row!;
});

/**
 * Patch the singleton settings row.
 *
 * Drizzle skips `undefined` values, so passing a partial object only touches
 * the keys the admin actually submitted — a stale form can't blank out columns
 * it never rendered.
 */
export async function updateSettings(
  input: SiteSettingsInput,
): Promise<SiteSettings> {
  await ensureBootstrap();
  const [row] = await db
    .update(siteSettings)
    .set({
      siteTitle: input.siteTitle,
      siteDescription: input.siteDescription,
      tagline: input.tagline,
      logoUrl: input.logoUrl,
      faviconUrl: input.faviconUrl,
      footerText: input.footerText,
      activeThemeSlug: input.activeThemeSlug,
      icpNumber: input.icpNumber,
      socialLinks: input.socialLinks,
      footerLinks: input.footerLinks,

      commentsEnabled: input.commentsEnabled,
      requireNameEmail: input.requireNameEmail,
      commentModeration: input.commentModeration,
      commentModerationWords: input.commentModerationWords,
      commentDefaultContent: input.commentDefaultContent,

      commentProvider: input.commentProvider,
      artalkServer: input.artalkServer,
      artalkSite: input.artalkSite,
      giscusRepo: input.giscusRepo,
      giscusRepoId: input.giscusRepoId,
      giscusCategory: input.giscusCategory,
      giscusCategoryId: input.giscusCategoryId,
      giscusMapping: input.giscusMapping,
      giscusReactions: input.giscusReactions,
      giscusTheme: input.giscusTheme,
      walineServer: input.walineServer,
      twikooEnvId: input.twikooEnvId,
      disqusShortname: input.disqusShortname,
      utterancesRepo: input.utterancesRepo,
      utterancesTerm: input.utterancesTerm,

      avatarSource: input.avatarSource,
      avatarSize: input.avatarSize,
      avatarDefault: input.avatarDefault,
      avatarRating: input.avatarRating,

      homeDisplay: input.homeDisplay,
      homePageId: input.homePageId,
      postsPageId: input.postsPageId,
      postsPerPage: input.postsPerPage,
      feedItems: input.feedItems,
      feedContent: input.feedContent,
      excerptLength: input.excerptLength,

      seoTitleTemplate: input.seoTitleTemplate,
      seoKeywords: input.seoKeywords,
      seoDefaultDescription: input.seoDefaultDescription,
      seoRobots: input.seoRobots,
      ogImageUrl: input.ogImageUrl,
      twitterCard: input.twitterCard,
      twitterSite: input.twitterSite,
      verifications: input.verifications,

      customHead: input.customHead,
      customFooter: input.customFooter,
      customCss: input.customCss,
      analyticsId: input.analyticsId,

      timezone: input.timezone,
      dateFormat: input.dateFormat,
      language: input.language,

      updatedAt: new Date(),
    })
    .where(eq(siteSettings.id, 1))
    .returning();
  return row!;
}

/**
 * Render the SEO title for a page using the configured template.
 * Supported placeholders: %title% %site% %tagline%
 */
export function formatSeoTitle(
  template: string,
  vars: { title?: string; site: string; tagline?: string },
): string {
  if (!vars.title) return vars.site;
  return (template || "%title% - %site%")
    .replace(/%title%/g, vars.title)
    .replace(/%site%/g, vars.site)
    .replace(/%tagline%/g, vars.tagline ?? "")
    .trim();
}

/** Format a Date with the site's `dateFormat` + `timezone` settings. */
export function formatSiteDate(
  date: Date | string | null | undefined,
  settings: Pick<SiteSettings, "dateFormat" | "timezone" | "language">,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";

  const tz = settings.timezone || "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-");
  const [y, m, day] = parts;

  switch (settings.dateFormat) {
    case "YYYY年M月D日":
      return `${y}年${Number(m)}月${Number(day)}日`;
    case "MMM D, YYYY":
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
    case "D/M/YYYY":
      return `${Number(day)}/${Number(m)}/${y}`;
    default:
      return `${y}-${m}-${day}`;
  }
}
