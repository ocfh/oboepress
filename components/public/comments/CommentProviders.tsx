"use client";

import { useEffect, useRef } from "react";
import type { CommentConfig } from "@/lib/comments-config";

/* -------------------------------------------------------------------------- */
/* Shared script loader                                                       */
/* -------------------------------------------------------------------------- */

interface InjectOpts {
  src: string;
  id?: string;
  attrs?: Record<string, string>;
  /** Run after the script loads (init-style widgets). */
  onLoad?: () => void;
  /** Where to append the <script>; defaults to <body>. */
  appendTo?: HTMLElement | null;
}

/**
 * Inject a <script> exactly once. A stable `id` prevents duplicate tags when
 * React re-mounts (StrictMode) or when the widget re-renders. `onLoad` only
 * fires for init-style widgets; attribute-style scripts (Giscus/Utterances)
 * self-initialise from their data-* attributes.
 */
function injectScript({ src, id, attrs, onLoad, appendTo }: InjectOpts): void {
  if (id && document.getElementById(id)) {
    // Already mounted (e.g. SPA re-navigation reusing the same container).
    // The widget re-initialises itself via the existing tag, so do nothing.
    return;
  }
  const s = document.createElement("script");
  if (id) s.id = id;
  s.src = src;
  s.async = true;
  for (const [k, v] of Object.entries(attrs ?? {})) s.setAttribute(k, v);
  const target = appendTo ?? document.body;
  if (onLoad) s.addEventListener("load", onLoad);
  target.appendChild(s);
}

/** Whether a global the widget exposes already exists (init-style). */
function hasGlobal(name: string): boolean {
  return typeof (window as any)[name] !== "undefined";
}

/* -------------------------------------------------------------------------- */
/* Artalk                                                                      */
/* -------------------------------------------------------------------------- */

function ArtalkEmbed({ cfg }: { cfg: CommentConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !cfg.artalk.server) return;
    const init = () => {
      if (hasGlobal("Artalk")) {
        (window as any).Artalk.init({
          el,
          server: cfg.artalk.server,
          site: cfg.artalk.site || location.hostname,
        });
      }
    };
    injectScript({
      src: "https://cdn.jsdelivr.net/npm/artalk@2/dist/Artalk.js",
      id: "artalk-script",
      onLoad: init,
      appendTo: el,
    });
    const link = document.createElement("link");
    link.id = "artalk-style";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/artalk@2/dist/Artalk.css";
    document.head.appendChild(link);
    return () => document.getElementById("artalk-style")?.remove();
  }, [cfg.artalk.server, cfg.artalk.site]);
  return <div id="Comments" ref={ref} />;
}

/* -------------------------------------------------------------------------- */
/* Giscus                                                                     */
/* -------------------------------------------------------------------------- */

function GiscusEmbed({ cfg }: { cfg: CommentConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !cfg.giscus.repo) return;
    const attrs: Record<string, string> = {
      src: "https://giscus.app/client.js",
      "data-repo": cfg.giscus.repo,
      "data-repo-id": cfg.giscus.repoId,
      "data-category": cfg.giscus.category,
      "data-category-id": cfg.giscus.categoryId,
      "data-mapping": cfg.giscus.mapping,
      "data-strict": "0",
      "data-reactions-enabled": cfg.giscus.reactions ? "1" : "0",
      "data-emit-metadata": "0",
      "data-input-position": "bottom",
      "data-lang": "zh-CN",
      "data-theme": cfg.giscus.theme || "preferred_color_scheme",
      crossorigin: "anonymous",
    };
    injectScript({ src: attrs.src, id: "giscus-script", attrs, appendTo: el });
  }, [cfg.giscus.repo, cfg.giscus.repoId, cfg.giscus.category, cfg.giscus.categoryId, cfg.giscus.mapping, cfg.giscus.reactions, cfg.giscus.theme]);
  return <div className="giscus" ref={ref} />;
}

/* -------------------------------------------------------------------------- */
/* Waline                                                                     */
/* -------------------------------------------------------------------------- */

function WalineEmbed({ cfg }: { cfg: CommentConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !cfg.waline.server) return;
    const init = () => {
      if (hasGlobal("Waline")) {
        (window as any).Waline.init({
          el,
          serverURL: cfg.waline.server,
          path: location.pathname,
          reaction: true,
          locale: { placeholder: "说点什么吧～" },
        });
      }
    };
    injectScript({
      src: "https://cdn.jsdelivr.net/npm/@waline/client@v3/dist/waline.js",
      id: "waline-script",
      onLoad: init,
      appendTo: el,
    });
    const link = document.createElement("link");
    link.id = "waline-style";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/@waline/client@v3/dist/waline.css";
    document.head.appendChild(link);
    return () => document.getElementById("waline-style")?.remove();
  }, [cfg.waline.server]);
  return <div id="waline" ref={ref} />;
}

/* -------------------------------------------------------------------------- */
/* Twikoo                                                                     */
/* -------------------------------------------------------------------------- */

function TwikooEmbed({ cfg }: { cfg: CommentConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !cfg.twikoo.envId) return;
    const init = () => {
      if (hasGlobal("twikoo")) {
        (window as any).twikoo.init({ envId: cfg.twikoo.envId, el });
      }
    };
    injectScript({
      src: "https://cdn.jsdelivr.net/npm/twikoo@1.6.41/dist/twikoo.all.min.js",
      id: "twikoo-script",
      onLoad: init,
      appendTo: el,
    });
  }, [cfg.twikoo.envId]);
  return <div id="tcomment" ref={ref} />;
}

/* -------------------------------------------------------------------------- */
/* Disqus                                                                     */
/* -------------------------------------------------------------------------- */

function DisqusEmbed({ cfg }: { cfg: CommentConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !cfg.disqus.shortname) return;
    (window as any).disqus_config = function (this: any) {
      this.page.url = location.href;
      this.page.identifier = location.pathname;
    };
    injectScript({
      src: `https://${cfg.disqus.shortname}.disqus.com/embed.js`,
      id: "disqus-script",
      appendTo: el,
    });
  }, [cfg.disqus.shortname]);
  return (
    <div
      id="disqus_thread"
      ref={ref}
      style={{ color: "var(--text-color-2, #9ca3af)" }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Utterances                                                                 */
/* -------------------------------------------------------------------------- */

function UtterancesEmbed({ cfg }: { cfg: CommentConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !cfg.utterances.repo) return;
    const attrs: Record<string, string> = {
      src: "https://utteranc.es/client.js",
      repo: cfg.utterances.repo,
      "issue-term": cfg.utterances.term,
      label: "评论",
      theme: "preferred-color-scheme",
      crossorigin: "anonymous",
    };
    injectScript({ src: attrs.src, id: "utterances-script", attrs, appendTo: el });
  }, [cfg.utterances.repo, cfg.utterances.term]);
  return <div className="utterances" ref={ref} />;
}

/* -------------------------------------------------------------------------- */
/* Dispatcher                                                                 */
/* -------------------------------------------------------------------------- */

export default function ThirdPartyComments({ cfg }: { cfg: CommentConfig }) {
  switch (cfg.provider) {
    case "artalk":
      return <ArtalkEmbed cfg={cfg} />;
    case "giscus":
      return <GiscusEmbed cfg={cfg} />;
    case "waline":
      return <WalineEmbed cfg={cfg} />;
    case "twikoo":
      return <TwikooEmbed cfg={cfg} />;
    case "disqus":
      return <DisqusEmbed cfg={cfg} />;
    case "utterances":
      return <UtterancesEmbed cfg={cfg} />;
    default:
      return (
        <p className="text-sm text-zinc-500">
          未配置第三方评论服务参数，请在「站点设置 → 评论」中填写。
        </p>
      );
  }
}
