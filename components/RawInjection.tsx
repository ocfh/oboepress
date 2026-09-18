"use client";

import { useEffect, useRef } from "react";

/**
 * Renders a raw-HTML injection slot (custom head/footer code, plugin head
 * nodes, analytics). Two requirements pull in opposite directions:
 *
 *  1. SEO payloads (JSON-LD, meta/link tags) must be present in the
 *     server-rendered HTML so crawlers see them without running JS — solved by
 *     `dangerouslySetInnerHTML`, which keeps the markup in the initial source.
 *  2. Executable <script> tags inserted via innerHTML never run — solved by
 *     cloning each script node into a fresh element on mount, which the
 *     browser does execute.
 *
 * The container is visually hidden; <style>/<meta> inside it still apply
 * globally. The resurrection is idempotent (marked nodes are skipped), so
 * React StrictMode's double effect and client-side navigations cannot fire a
 * script twice.
 */
export default function RawInjection({
  html,
  id,
}: {
  html: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll("script:not([data-oboe-injected])").forEach((old) => {
      const fresh = document.createElement("script");
      for (const name of old.getAttributeNames()) {
        fresh.setAttribute(name, old.getAttribute(name) ?? "");
      }
      // Copy inline source after attributes so an inline <script> keeps its body.
      fresh.textContent = old.textContent;
      fresh.setAttribute("data-oboe-injected", "1");
      old.parentNode?.replaceChild(fresh, old);
    });
  }, [html]);

  if (!html) return null;
  return (
    <div
      ref={ref}
      id={id}
      aria-hidden="true"
      style={{ display: "none" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
