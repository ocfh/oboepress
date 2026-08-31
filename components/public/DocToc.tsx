"use client";

import { useEffect, useState } from "react";

type Heading = { id: string; text: string; level: number };

export default function DocToc({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="doc-toc-panel">
      <div className="toc-header">目录</div>
      <div className="toc-list">
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            className={`toc-item ${activeId === h.id ? "active" : ""} level-${h.level}`}
          >
            {h.text}
          </a>
        ))}
      </div>
    </div>
  );
}
