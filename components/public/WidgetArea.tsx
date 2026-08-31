import Link from "next/link";
import { getAreaWidgets, type ResolvedWidget } from "@/lib/services/widgets";
import { renderShortcodes, ensureShortcodes } from "@/lib/shortcodes";

/**
 * Renders every widget placed into a theme-declared area.
 *
 * Themes call `<WidgetArea themeSlug={slug} area="sidebar" />` and get whatever
 * the user configured in /admin/widgets — the same contract as nvPress's
 * `register_theme_modules()`, but rendered server-side with no client JS.
 */

export default async function WidgetArea({
  themeSlug,
  area,
  className,
  emptyFallback,
}: {
  themeSlug: string;
  area: string;
  className?: string;
  emptyFallback?: React.ReactNode;
}) {
  const items = await getAreaWidgets(themeSlug, area);
  if (!items.length) return <>{emptyFallback ?? null}</>;

  return (
    <div className={className ?? "space-y-6"}>
      {items.map((w) => (
        <WidgetShell key={w.id} widget={w} />
      ))}
    </div>
  );
}

function WidgetShell({ widget }: { widget: ResolvedWidget }) {
  return (
    <section
      className="oboe-widget"
      data-widget={widget.type}
      style={{
        background: "var(--surface)",
        border: "var(--border-width) solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1rem 1.1rem",
      }}
    >
      {widget.title ? (
        <h3
          style={{
            fontSize: ".8rem",
            fontWeight: 600,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: ".75rem",
          }}
        >
          {widget.title}
        </h3>
      ) : null}
      <WidgetBody widget={widget} />
    </section>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--text)",
  textDecoration: "none",
  fontSize: ".9rem",
  lineHeight: 1.5,
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: ".6rem",
  padding: ".35rem 0",
};
const dimStyle: React.CSSProperties = {
  color: "var(--muted)",
  fontSize: ".75rem",
  whiteSpace: "nowrap",
};

async function WidgetBody({ widget }: { widget: ResolvedWidget }) {
  const cfg = widget.config;

  switch (widget.type) {
    case "recent-posts": {
      const items = (widget.data ?? []) as {
        id: number;
        title: string;
        slug: string;
        publishedAt: Date | null;
        featuredImage: string | null;
      }[];
      return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((p) => (
            <li key={p.id} style={rowStyle}>
              {cfg.showThumb && p.featuredImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.featuredImage}
                  alt=""
                  style={{
                    width: 44,
                    height: 44,
                    objectFit: "cover",
                    borderRadius: 8,
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <Link href={`/blog/${p.slug}`} style={{ ...linkStyle, flex: 1 }}>
                {p.title}
              </Link>
              {cfg.showDate && p.publishedAt ? (
                <span style={dimStyle}>
                  {new Date(p.publishedAt).toISOString().slice(5, 10)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
    }

    case "popular-posts": {
      const items = (widget.data ?? []) as {
        id: number;
        title: string;
        slug: string;
        views: number;
      }[];
      return (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, counterReset: "pp" }}>
          {items.map((p, i) => (
            <li key={p.id} style={rowStyle}>
              <span style={{ ...dimStyle, width: "1.2em", color: "var(--accent)" }}>
                {i + 1}
              </span>
              <Link href={`/blog/${p.slug}`} style={{ ...linkStyle, flex: 1 }}>
                {p.title}
              </Link>
              {cfg.showViews ? <span style={dimStyle}>{p.views}</span> : null}
            </li>
          ))}
        </ol>
      );
    }

    case "categories": {
      const items = (widget.data ?? []) as {
        id: number;
        name: string;
        slug: string;
        count: number;
      }[];
      return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((c) => (
            <li key={c.id} style={rowStyle}>
              <Link href={`/blog/category/${c.slug}`} style={linkStyle}>
                {c.name}
              </Link>
              {cfg.showCount ? <span style={dimStyle}>{c.count}</span> : null}
            </li>
          ))}
        </ul>
      );
    }

    case "tag-cloud": {
      const items = (widget.data ?? []) as {
        id: number;
        name: string;
        slug: string;
        count: number;
      }[];
      const max = Math.max(1, ...items.map((t) => Number(t.count)));
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
          {items.map((t) => {
            const scale = cfg.scale
              ? 0.78 + (Number(t.count) / max) * 0.5
              : 0.85;
            return (
              <Link
                key={t.id}
                href={`/blog/tag/${t.slug}`}
                style={{
                  fontSize: `${scale}rem`,
                  color: "var(--muted)",
                  textDecoration: "none",
                  padding: ".1rem .45rem",
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                }}
              >
                {t.name}
              </Link>
            );
          })}
        </div>
      );
    }

    case "archive": {
      const items = (widget.data ?? []) as { period: string; count: number }[];
      return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((a) => {
            const [y, m] = a.period.split("-");
            return (
              <li key={a.period} style={rowStyle}>
                <Link
                  href={m ? `/archives?year=${y}&month=${m}` : `/archives?year=${y}`}
                  style={linkStyle}
                >
                  {m ? `${y} 年 ${Number(m)} 月` : `${y} 年`}
                </Link>
                {cfg.showCount ? <span style={dimStyle}>{a.count}</span> : null}
              </li>
            );
          })}
        </ul>
      );
    }

    case "recent-comments": {
      const items = (widget.data ?? []) as {
        id: number;
        authorName: string;
        content: string;
        postId: number;
        createdAt: Date;
      }[];
      const len = Number(cfg.excerptLength ?? 48);
      return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((c) => (
            <li
              key={c.id}
              style={{ padding: ".45rem 0", borderBottom: "1px solid var(--border)" }}
            >
              <p style={{ fontSize: ".78rem", color: "var(--accent)", margin: 0 }}>
                {c.authorName}
              </p>
              <p
                style={{
                  fontSize: ".85rem",
                  color: "var(--muted)",
                  margin: ".2rem 0 0",
                  lineHeight: 1.5,
                }}
              >
                {c.content.length > len ? `${c.content.slice(0, len)}…` : c.content}
              </p>
            </li>
          ))}
        </ul>
      );
    }

    case "stats": {
      const s = (widget.data ?? {}) as {
        posts: number;
        views: number;
        comments: number;
        tags: number;
        categories: number;
      };
      const rows: [string, string | number][] = [];
      if (cfg.showPosts) rows.push(["文章", s.posts]);
      rows.push(["分类", s.categories], ["标签", s.tags]);
      if (cfg.showComments) rows.push(["评论", s.comments]);
      if (cfg.showViews) rows.push(["总阅读", s.views]);
      if (cfg.showRuntime && cfg.since) {
        const days = Math.max(
          0,
          Math.floor((Date.now() - new Date(String(cfg.since)).getTime()) / 86400000),
        );
        rows.push(["已运行", `${days} 天`]);
      }
      return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map(([k, v]) => (
            <li key={k} style={rowStyle}>
              <span style={{ fontSize: ".85rem", color: "var(--muted)" }}>{k}</span>
              <span style={{ fontSize: ".85rem", fontWeight: 600 }}>{v}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "search":
      return (
        <form action="/search" method="get" style={{ display: "flex", gap: ".4rem" }}>
          <input
            name="q"
            placeholder={String(cfg.placeholder ?? "搜索文章…")}
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: ".45rem .7rem",
              fontSize: ".85rem",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              border: 0,
              borderRadius: "var(--radius)",
              padding: ".45rem .8rem",
              fontSize: ".85rem",
              cursor: "pointer",
            }}
          >
            搜索
          </button>
        </form>
      );

    case "profile": {
      const links = Array.isArray(cfg.links)
        ? (cfg.links as { label?: string; url?: string }[])
        : [];
      return (
        <div style={{ textAlign: "center" }}>
          {cfg.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={String(cfg.avatar)}
              alt=""
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                objectFit: "cover",
                margin: "0 auto .6rem",
                display: "block",
              }}
            />
          ) : null}
          {cfg.name ? (
            <p style={{ fontWeight: 600, margin: 0 }}>{String(cfg.name)}</p>
          ) : null}
          {cfg.role ? (
            <p style={{ fontSize: ".78rem", color: "var(--accent)", margin: ".15rem 0 0" }}>
              {String(cfg.role)}
            </p>
          ) : null}
          {cfg.bio ? (
            <p
              style={{
                fontSize: ".85rem",
                color: "var(--muted)",
                lineHeight: 1.6,
                margin: ".6rem 0 0",
              }}
            >
              {String(cfg.bio)}
            </p>
          ) : null}
          {links.length ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: ".6rem",
                marginTop: ".75rem",
                flexWrap: "wrap",
              }}
            >
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.url ?? "#"}
                  target="_blank"
                  rel="noopener"
                  style={{ fontSize: ".8rem", color: "var(--muted)" }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    case "links": {
      const items = Array.isArray(cfg.items)
        ? (cfg.items as { label?: string; url?: string }[])
        : [];
      return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((l, i) => (
            <li key={i} style={rowStyle}>
              <a href={l.url ?? "#"} target="_blank" rel="noopener" style={linkStyle}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      );
    }

    case "text": {
      ensureShortcodes();
      const html = await renderShortcodes(String(cfg.body ?? ""), { kind: "widget" });
      return (
        <div
          className="oboe-widget-text"
          style={{ fontSize: ".9rem", lineHeight: 1.7, color: "var(--muted)" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    default:
      return null;
  }
}
