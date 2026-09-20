"use client";

import { useEffect, useState } from "react";
import EmojiPanel from "./EmojiPanel";

export default function EmojiPanelWrap({
  show,
  onSelect,
}: {
  show: boolean;
  onSelect: (emoji: string) => void;
}) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setMounted(true);
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!mounted) return null;
  return (
    <span className={`emoji-panel-wrap${visible ? " is-in" : ""}`} aria-hidden={!show}>
      <EmojiPanel onSelect={onSelect} />
    </span>
  );
}
