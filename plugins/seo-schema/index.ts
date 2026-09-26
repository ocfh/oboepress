import { definePlugin } from "@/lib/plugins/api";

type Settings = {
  orgName: string;
  orgLogo: string;
  type: string;
  breadcrumb: boolean;
  website: boolean;
};

type HeadPayload = {
  /** Raw <script>/<meta> strings the layout will render inside <head>. */
  nodes: string[];
  context: {
    kind: "home" | "post" | "page" | "archive" | "taxonomy" | "search";
    siteTitle: string;
    siteUrl: string;
    title?: string;
    description?: string;
    image?: string;
    publishedAt?: string | null;
    updatedAt?: string | null;
    author?: string;
    url?: string;
    breadcrumbs?: { label: string; href: string }[];
  };
};

function jsonLd(data: unknown): string {
  // Escape "</" so a stray sequence in user content cannot close the script tag.
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  return `<script type="application/ld+json">${json}</script>`;
}

export default definePlugin<Settings>({
  setup({ settings, addFilter, HOOKS }) {
    addFilter<HeadPayload>(HOOKS.headTags, (payload) => {
      const c = payload.context;
      const orgName = settings.orgName || c.siteTitle;

      if (settings.website && c.kind === "home") {
        payload.nodes.push(
          jsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: c.siteTitle,
            url: c.siteUrl,
            potentialAction: {
              "@type": "SearchAction",
              target: `${c.siteUrl}/search?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          }),
        );
      }

      if (c.kind === "post" || c.kind === "page") {
        payload.nodes.push(
          jsonLd({
            "@context": "https://schema.org",
            "@type": c.kind === "post" ? settings.type || "BlogPosting" : "WebPage",
            headline: c.title,
            description: c.description,
            image: c.image ? [c.image] : undefined,
            datePublished: c.publishedAt ?? undefined,
            dateModified: c.updatedAt ?? c.publishedAt ?? undefined,
            author: { "@type": "Person", name: c.author || orgName },
            publisher: {
              "@type": "Organization",
              name: orgName,
              logo: settings.orgLogo
                ? { "@type": "ImageObject", url: settings.orgLogo }
                : undefined,
            },
            mainEntityOfPage: c.url ? { "@type": "WebPage", "@id": c.url } : undefined,
          }),
        );
      }

      if (settings.breadcrumb && c.breadcrumbs?.length) {
        payload.nodes.push(
          jsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: c.breadcrumbs.map((b, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: b.label,
              item: `${c.siteUrl}${b.href}`,
            })),
          }),
        );
      }

      return payload;
    });
  },
});
