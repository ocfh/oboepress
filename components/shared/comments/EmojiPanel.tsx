"use client";

// Emoji picker: one scrollable body with sticky group titles; clicking a tab
// scrolls to the group; scrolling highlights the tab of the group in view
// (-30px threshold).
import { useRef, useState } from "react";
import DATA from "./emoji-data.json";

const GROUPS = Object.entries(DATA).map(([name, items]) => ({ name, items }));

export default function EmojiPanel({ onSelect }: { onSelect: (emoji: string) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  function scrollToGroup(i: number) {
    const sc = scrollerRef.current;
    const el = groupRefs.current[i];
    if (sc && el) sc.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    setActive(i);
  }

  function onScroll() {
    const sc = scrollerRef.current;
    if (!sc) return;
    const top = sc.scrollTop;
    let idx = 0;
    groupRefs.current.forEach((el, i) => {
      if (el && top >= el.offsetTop - 30) idx = i;
    });
    setActive(idx);
  }

  return (
    <div className="emoji-panel" onMouseDown={(e) => e.preventDefault()}>
      <div className="panel" ref={scrollerRef} onScroll={onScroll}>
        {GROUPS.map((g, i) => (
          <section
            key={g.name}
            id={`emoji-group-${i}`}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            className="emoji-group"
          >
            <div className="title">{g.name}</div>
            <div className="emoji-grid">
              {g.items.map((e) => (
                <button key={e} type="button" className="emoji" onClick={() => onSelect(e)}>
                  {e}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="tabs">
        {GROUPS.map((g, i) => (
          <button
            key={g.name}
            type="button"
            title={g.name}
            aria-label={g.name}
            className={i === active ? "active" : ""}
            onClick={() => scrollToGroup(i)}
          >
            {g.items[0]}
          </button>
        ))}
      </div>
    </div>
  );
}
