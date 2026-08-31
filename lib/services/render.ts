import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { serializeBlocks, blocksToPlainText, type Block } from "@/lib/blocks";
import { applyAsyncFilters, applyFilters, HOOKS } from "@/lib/hooks";
import {
  ensureShortcodes,
  renderShortcodes,
  type ShortcodeResolvers,
} from "@/lib/shortcodes";
import { ensurePluginsLoaded } from "./plugins";
import { listPosts } from "./posts";

/**
 * The single content rendering pipeline used by every public page.
 *
 *   Block[]  →  HTML  →  shortcode expansion  →  `content.html` filter
 *
 * Running plugins *before* rendering guarantees a plugin's shortcodes and
 * content filters are registered by the time we touch the payload.
 */

function resolvers(): ShortcodeResolvers {
  return {
    media: async (ids) => {
      if (!ids.length) return [];
      const rows = await db
        .select({ id: media.id, url: media.url, alt: media.alt })
        .from(media)
        .where(inArray(media.id, ids));
      // Preserve the author's declared order.
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((i) => byId.get(i)).filter(Boolean) as typeof rows;
    },
    posts: async ({ limit, category, tag }) => {
      const { items } = await listPosts({
        status: "published",
        categorySlug: category,
        tagSlug: tag,
        limit: Math.min(Math.max(limit, 1), 50),
      });
      return items.map((p) => ({
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        publishedAt: p.publishedAt,
      }));
    },
  };
}

export interface RenderOptions {
  kind?: "post" | "page" | "widget" | "other";
  postId?: number;
  slug?: string;
  siteTitle?: string;
}

/** Render stored blocks into final public HTML. */
export async function renderContent(
  blocks: Block[] | null | undefined,
  opts: RenderOptions = {},
): Promise<string> {
  await ensurePluginsLoaded();
  ensureShortcodes();

  let html = serializeBlocks(blocks);
  html = await renderShortcodes(html, {
    kind: opts.kind,
    postId: opts.postId,
    slug: opts.slug,
    siteTitle: opts.siteTitle,
    resolvers: resolvers(),
  });
  const filtered = await applyAsyncFilters(HOOKS.contentHtml, {
    html,
    context: opts,
  });
  return filtered.html;
}

/** Plain text version (excerpts, reading time, search index). */
export function renderPlainText(blocks: Block[] | null | undefined): string {
  return blocksToPlainText(blocks);
}

export interface MetaItem {
  label: string;
  value: string;
}

/**
 * Build the meta line under a post title. Core contributes date/author/views;
 * plugins append their own rows through the `post.meta` filter.
 */
export async function buildPostMeta(
  post: {
    publishedAt?: Date | null;
    createdAt?: Date;
    views?: number;
    commentsCount?: number;
    author?: { name: string } | null;
  },
  plainText: string,
  base: MetaItem[] = [],
): Promise<MetaItem[]> {
  await ensurePluginsLoaded();
  const payload = applyFilters<{ post: unknown; items: MetaItem[] }>(HOOKS.postMeta, {
    post: { ...post, plainText },
    items: [...base],
  });
  return payload.items;
}

/** Collect plugin-provided <head> nodes for a page. */
export async function buildHeadNodes(context: Record<string, unknown>): Promise<string[]> {
  await ensurePluginsLoaded();
  const payload = applyFilters<{ nodes: string[]; context: Record<string, unknown> }>(
    HOOKS.headTags,
    { nodes: [], context },
  );
  return payload.nodes;
}

/** Collect plugin-provided markup injected before </body>. */
export async function buildFooterHtml(): Promise<string> {
  await ensurePluginsLoaded();
  const payload = applyFilters<{ html: string[] }>(HOOKS.footerHtml, { html: [] });
  return payload.html.join("\n");
}
