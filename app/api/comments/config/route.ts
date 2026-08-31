import { handleError, ok } from "@/lib/http";
import { getSettings } from "@/lib/services/settings";
import { resolveCommentConfig } from "@/lib/comments-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public comment-provider configuration. The <Comments> widget fetches this to
 * decide whether to render the built-in form or inject a third-party embed.
 * Only non-sensitive values are exposed (provider shortnames / repo ids are
 * already public on the front-end of those services).
 */
export async function GET() {
  try {
    const settings = await getSettings();
    return ok(resolveCommentConfig(settings));
  } catch (e) {
    return handleError(e);
  }
}
