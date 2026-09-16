"use client";

import { useState } from "react";
import { Share2, Link as LinkIcon, Check, Mail, MessageCircle } from "lucide-react";

/**
 * Share bar for a single post. Tries the native share sheet first, then falls
 * back to copy-link + Weibo/Twitter/email deep links. All client-side; the
 * canonical URL is passed in from the server.
 */
export default function ShareButtons({
  title,
  url,
}: {
  title: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      copyLink();
    }
  }

  const wb = `http://service.weibo.com/share/share.php?url=${encodeURIComponent(
    url,
  )}&title=${encodeURIComponent(title)}`;
  const tw = `https://twitter.com/intent/tweet?url=${encodeURIComponent(
    url,
  )}&text=${encodeURIComponent(title)}`;
  const mail = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-6">
      <span className="mr-1 inline-flex items-center gap-1 text-sm text-zinc-400">
        <Share2 size={15} />
        分享
      </span>
      <button
        type="button"
        onClick={nativeShare}
        title="复制链接 / 系统分享"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        {copied ? <Check size={13} className="text-emerald-400" /> : <LinkIcon size={13} />}
        {copied ? "已复制" : "复制链接"}
      </button>
      <a
        href={wb}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        微博
      </a>
      <a
        href={tw}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        Twitter
      </a>
      <a
        href={mail}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <Mail size={13} />
        邮件
      </a>
    </div>
  );
}
