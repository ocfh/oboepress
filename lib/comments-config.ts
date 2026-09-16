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
