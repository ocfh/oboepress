/**
 * Resolve the comment *provider* configuration from the site settings row into
 * a single, client-safe object. The `Comments` component fetches this from
 * `/api/comments/config` and uses it to decide whether to render the built-in
 * form or inject a third-party widget (Artalk / Giscus / Waline / Twikoo /
 * Disqus / Utterances).
 */
import type { SiteSettings } from "@/db/schema";
import type { AvatarSource } from "./avatar";

export type CommentProvider =
  | "builtin"
  | "artalk"
  | "giscus"
  | "waline"
  | "twikoo"
  | "disqus"
  | "utterances"
  | "none";

export interface CommentConfig {
  provider: CommentProvider;
  /** Global master switch (site_settings.comments_enabled). */
  enabled: boolean;
  avatar: {
    source: AvatarSource;
    size: number;
    default: string;
    rating: string;
  };
  artalk: { server: string; site: string };
  giscus: {
    repo: string;
    repoId: string;
    category: string;
    categoryId: string;
    mapping: string;
    reactions: boolean;
    theme: string;
  };
  waline: { server: string };
  twikoo: { envId: string };
  disqus: { shortname: string };
  utterances: { repo: string; term: string };
}

export const COMMENT_PROVIDERS: { value: CommentProvider; label: string }[] = [
  { value: "builtin", label: "系统自带（内置数据库）" },
  { value: "artalk", label: "Artalk（自建）" },
  { value: "giscus", label: "Giscus（GitHub 讨论）" },
  { value: "waline", label: "Waline（valine 继任）" },
  { value: "twikoo", label: "Twikoo（腾讯云/私有）" },
  { value: "disqus", label: "Disqus" },
  { value: "utterances", label: "Utterances（GitHub Issues）" },
  { value: "none", label: "不显示评论" },
];

export const AVATAR_SOURCES: { value: AvatarSource; label: string }[] = [
  { value: "gravatar", label: "Gravatar（国际）" },
  { value: "cn-gravatar", label: "Gravatar 国内镜像" },
  { value: "cravatar", label: "Cravatar（酷家）" },
  { value: "weavatar", label: "WeAvatar" },
  { value: "libravatar", label: "Libravatar" },
  { value: "qq", label: "QQ 邮箱 → QQ 头像" },
  { value: "none", label: "无头像" },
];

/** Build a CommentConfig from a raw site_settings row. */
export function resolveCommentConfig(s: Partial<SiteSettings>): CommentConfig {
  return {
    provider: (s.commentProvider as CommentProvider) || "builtin",
    enabled: s.commentsEnabled ?? true,
    avatar: {
      source: (s.avatarSource as AvatarSource) || "gravatar",
      size: s.avatarSize ?? 80,
      default: s.avatarDefault || "identicon",
      rating: s.avatarRating || "g",
    },
    artalk: {
      server: s.artalkServer || "",
      site: s.artalkSite || "",
    },
    giscus: {
      repo: s.giscusRepo || "",
      repoId: s.giscusRepoId || "",
      category: s.giscusCategory || "General",
      categoryId: s.giscusCategoryId || "",
      mapping: s.giscusMapping || "pathname",
      reactions: s.giscusReactions ?? true,
      theme: s.giscusTheme || "",
    },
    waline: { server: s.walineServer || "" },
    twikoo: { envId: s.twikooEnvId || "" },
    disqus: { shortname: s.disqusShortname || "" },
    utterances: { repo: s.utterancesRepo || "", term: s.utterancesTerm || "pathname" },
  };
}
