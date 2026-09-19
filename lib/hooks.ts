/**
 * Hook system — extension contract shared by plugins and themes.
 * Named registry of ordered callbacks: actions are fire-and-forget, filters
 * transform a payload. One payload object in/out, default priority 10,
 * idempotent registration, shared on globalThis across routes.
 */

export type HookCallback<P = any> = (payload: P) => P | void | Promise<P | void>;

type Registration = {
  callback: HookCallback;
  priority: number;
  /** Plugin/theme slug that owns this registration — lets us unregister cleanly. */
  owner?: string;
};

type Registry = {
  actions: Map<string, Registration[]>;
  filters: Map<string, Registration[]>;
};

const globalForHooks = globalThis as unknown as { __oboeHooks?: Registry };

function registry(): Registry {
  if (!globalForHooks.__oboeHooks) {
    globalForHooks.__oboeHooks = { actions: new Map(), filters: new Map() };
  }
  return globalForHooks.__oboeHooks;
}

/** Slug of the plugin currently being loaded — attached to its registrations. */
let currentOwner: string | undefined;

/** Internal: used by the plugin loader to tag registrations with their owner. */
export function withOwner<T>(owner: string, fn: () => T): T {
  const prev = currentOwner;
  currentOwner = owner;
  try {
    return fn();
  } finally {
    currentOwner = prev;
  }
}

function insert(map: Map<string, Registration[]>, hook: string, reg: Registration) {
  const list = map.get(hook) ?? [];
  // De-dupe by function identity so double-evaluation is a no-op.
  if (list.some((r) => r.callback === reg.callback)) return;
  list.push(reg);
  list.sort((a, b) => a.priority - b.priority);
  map.set(hook, list);
}

/** Register a side-effecting listener. */
export function addAction<P = any>(
  hook: string,
  callback: HookCallback<P>,
  priority = 10,
): void {
  insert(registry().actions, hook, {
    callback: callback as HookCallback,
    priority,
    owner: currentOwner,
  });
}

/** Register a transformer. It MUST return the (possibly modified) payload. */
export function addFilter<P = any>(
  hook: string,
  callback: HookCallback<P>,
  priority = 10,
): void {
  insert(registry().filters, hook, {
    callback: callback as HookCallback,
    priority,
    owner: currentOwner,
  });
}

/** Drop every registration made by a plugin/theme (used when disabling it). */
export function removeAllByOwner(owner: string): void {
  const r = registry();
  for (const [hook, list] of r.actions)
    r.actions.set(hook, list.filter((x) => x.owner !== owner));
  for (const [hook, list] of r.filters)
    r.filters.set(hook, list.filter((x) => x.owner !== owner));
}

/** Fire an action synchronously (async callbacks are not awaited). */
export function doAction<P = any>(hook: string, payload?: P): void {
  for (const r of registry().actions.get(hook) ?? []) {
    try {
      r.callback(payload as P);
    } catch (err) {
      console.error(`[hooks] action "${hook}" (${r.owner ?? "core"}) failed:`, err);
    }
  }
}

/** Run a payload through every filter, synchronously. */
export function applyFilters<P>(hook: string, payload: P): P {
  let value = payload;
  for (const r of registry().filters.get(hook) ?? []) {
    try {
      const next = r.callback(value) as P | undefined;
      if (next !== undefined && next !== null) value = next;
    } catch (err) {
      console.error(`[hooks] filter "${hook}" (${r.owner ?? "core"}) failed:`, err);
    }
  }
  return value;
}

/** Run a payload through every filter, awaiting async ones. */
export async function applyAsyncFilters<P>(hook: string, payload: P): Promise<P> {
  let value = payload;
  for (const r of registry().filters.get(hook) ?? []) {
    try {
      const next = (await r.callback(value)) as P | undefined;
      if (next !== undefined && next !== null) value = next;
    } catch (err) {
      console.error(`[hooks] async filter "${hook}" (${r.owner ?? "core"}) failed:`, err);
    }
  }
  return value;
}

/** Introspection for the admin "hooks" debug panel. */
export function listHooks(): {
  actions: { hook: string; count: number; owners: string[] }[];
  filters: { hook: string; count: number; owners: string[] }[];
} {
  const map = (m: Map<string, Registration[]>) =>
    [...m.entries()]
      .filter(([, l]) => l.length > 0)
      .map(([hook, l]) => ({
        hook,
        count: l.length,
        owners: [...new Set(l.map((r) => r.owner ?? "core"))],
      }))
      .sort((a, b) => a.hook.localeCompare(b.hook));
  return { actions: map(registry().actions), filters: map(registry().filters) };
}

/**
 * Well-known core hooks. Documented here so plugin authors have one canonical
 * list, and so renaming one is a compile error rather than a silent no-op.
 */
export const HOOKS = {
  /** filter — ({ html, context }) transform rendered block HTML */
  contentHtml: "content.html",
  /** filter — ({ post, items }) add rows to the post meta line */
  postMeta: "post.meta",
  /** filter — ({ post }) mutate a post right before it is rendered */
  postRender: "post.render",
  /** filter — ({ title, context }) transform the <title> */
  documentTitle: "document.title",
  /** filter — ({ nodes }) inject extra <head> nodes */
  headTags: "head.tags",
  /** filter — ({ html }) inject markup right before </body> */
  footerHtml: "footer.html",
  /** filter — ({ items }) add admin sidebar entries */
  adminMenu: "admin.menu",
  /** filter — ({ cards }) add dashboard cards */
  dashboardCards: "dashboard.cards",
  /** filter — ({ widgets }) register extra widget types */
  widgetTypes: "widget.types",
  /** filter — ({ shortcodes }) register extra shortcodes */
  shortcodes: "shortcode.register",
  /** filter — ({ fields }) extra editor fields for the post/page editor. Theme
   *  and plugin authors add fields here so the shared editor renders them.
   *  Payload is `{ fields: Record<string, ThemeEditorField> }`; return merged. */
  editorFields: "editor.fields",
  /** action — ({ post }) fired after a post transitions to published */
  postPublished: "post.published",
  /** action — ({ post }) fired after any post save */
  postSaved: "post.saved",
  /** action — ({ comment }) fired after a comment is stored */
  commentCreated: "comment.created",
  /** filter — ({ comment, approved }) decide auto-approval */
  commentApprove: "comment.approve",
  /**
   * async filter — ({ data, userId, ip, reject }) runs on POST /api/comments
   * BEFORE the comment is created. `data` is the schema-validated body
   * (including the opaque captchaToken/captchaAnswer passthrough fields).
   * A guard plugin (e.g. comment-captcha) sets `reject` to a Chinese message
   * to make the API respond 422; core strips the passthrough fields before
   * the value reaches the storage layer.
   */
  commentSubmission: "comment.submission",
  /** action — ({ media }) fired after an upload completes */
  mediaUploaded: "media.uploaded",
  /** action — ({ user }) fired after a successful login */
  userLoggedIn: "user.logged-in",
  /**
   * async filter — ({ user, challenge }) run after the password passes but
   * before the session cookie is issued. A second-factor plugin sets
   * `challenge` (e.g. { type: "totp" }); core then hands the client a
   * short-lived ticket and waits for auth.challenge.verify.
   */
  authChallenge: "auth.challenge",
  /**
   * async filter — ({ user, code, ok }) verifies the second-factor code.
   * A plugin sets `ok: true` when the code matches; it owns consumption of
   * one-time recovery codes itself.
   */
  authChallengeVerify: "auth.challenge.verify",
  /**
   * filter — ({ query, ids }) contribute ordered "floating" (sticky) post ids.
   * Core floats them above date/views ordering on the first page of every
   * public list, validates them against the archive's own filters, and
   * excludes them from later pages so they can never appear twice.
   */
  postsPinned: "posts.pinned",
  /**
   * async filter — ({ entries, base, posts, pages, categories, tags })
   * add, remove or rewrite sitemap rows right before /sitemap.xml renders.
   * Entries may carry absolute `images` URLs (image sitemap extension).
   */
  sitemapUrls: "sitemap.urls",
  /**
   * async filter — ({ ...SitemapPayload, searchParams, doc }) replace the
   * whole /sitemap.xml response. Core fills `doc` (the default urlset) only
   * for requests with no query params; any ?… request starts with doc=null
   * so a plugin can claim it (e.g. ?kind=news, ?part=2). A plugin may also
   * swap the default doc for a sitemapindex when entries exceed the
   * 50,000-url / 50MB limits. Leaving doc null makes the route respond 404
   * (unclaimed param or out-of-range shard number).
   */
  sitemapDocument: "sitemap.document",
  /** filter — ({ lines, base }) mutate the generated /robots.txt lines */
  robotsRules: "robots.rules",
  /**
   * async filter — ({ segments, route }) let plugins claim a public URL that
   * has no post/page/category/tag entity behind it (e.g. friend-links' /links
   * virtual page). The first plugin that sets `route` wins; entities, the
   * secret admin entry and the register path all take precedence over this.
   * Payload/route shape: see lib/services/virtual-routes.ts.
   */
  siteRoutes: "site.routes",
} as const;
