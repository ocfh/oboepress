"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Smile, User, Mail, Link as LinkIcon, RotateCcw, Reply, Send } from "lucide-react";
import type { CommentConfig } from "@/lib/comments-config";

// 按需分包（client-only）：表情面板仅在点开表情按钮时才下载；
// 第三方评论（6 个 provider 的脚本注入器）仅在后台启用非 builtin
// 通道时才下载。内置评论页不承担这两块体积。
const ThirdPartyComments = dynamic(
  () => import("@/components/shared/comments/CommentProviders"),
  { ssr: false },
);
const EmojiPanel = dynamic(
  () => import("@/components/shared/comments/EmojiPanel"),
  { ssr: false },
);

type C = {
  id: number;
  parentId: number | null;
  authorName: string;
  authorUrl?: string | null;
  content: string;
  createdAt: string;
  avatarUrl?: string | null;
  children: C[];
};

/** Only allow http(s) homepage links so stored URLs can't inject schemes. */
function safeUrl(u?: string | null): string | null {
  if (!u) return null;
  const t = u.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return null;
}

function buildTree(flat: C[]): C[] {
  const byId = new Map<number, C>();
  flat.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: C[] = [];
  flat.forEach((c) => {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

async function loadConfig(): Promise<CommentConfig | null> {
  try {
    const res = await fetch("/api/comments/config", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fmtDate(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DFLT_AVATAR = "linear-gradient(135deg,#dce8f7,#bcd6f3)";

export default function Comments({
  postId,
  postType = "post",
  open,
  requireNameEmail,
}: {
  postId: number;
  postType?: string;
  open: boolean;
  requireNameEmail: boolean;
}) {
  const [cfg, setCfg] = useState<CommentConfig | null>(null);

  useEffect(() => {
    loadConfig().then(setCfg);
  }, []);

  // The surrounding page template already renders the "N 条回应" heading
  // inside the model card, so we only render the list / form here.
  if (!cfg) {
    return <div className="sf-comment-close">加载评论中…</div>;
  }

  if (!cfg.enabled || cfg.provider === "none") {
    return <div className="sf-comment-close">评论已关闭。</div>;
  }

  if (cfg.provider !== "builtin") {
    return <ThirdPartyComments cfg={cfg} />;
  }

  return (
    <BuiltinComments
      postId={postId}
      postType={postType}
      open={open}
      requireNameEmail={requireNameEmail}
      defaultContent={cfg.defaultContent}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Built-in comment system (.comment-list)                                    */
/* -------------------------------------------------------------------------- */

function avatarStyle(url?: string | null): React.CSSProperties {
  return url
    ? { backgroundImage: `url("${url.replace(/"/g, "%22")}")` }
    : { backgroundImage: DFLT_AVATAR };
}

function BuiltinComments({
  postId,
  postType,
  open,
  requireNameEmail,
  defaultContent,
}: {
  postId: number;
  postType: string;
  open: boolean;
  requireNameEmail: boolean;
  defaultContent?: string;
}) {
  const [tree, setTree] = useState<C[]>([]);
  const [me, setMe] = useState<{ id: number; name: string; email: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState(defaultContent ?? "");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // Reference behaviour: the .input box highlights while ANY form field is
  // focused (textarea + the three guest inputs increment one counter).
  const [focusCount, setFocusCount] = useState(0);
  const bindFocus = {
    onFocus: () => setFocusCount((v) => v + 1),
    onBlur: () => setFocusCount((v) => Math.max(0, v - 1)),
  };

  // Emoji picker: remember the textarea selection so emoji land at the caret
  // even though the panel steals interaction. Never-focused => append at end,
  // same as the reference component.
  const taRef = useRef<HTMLTextAreaElement>(null);
  const funcsRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<[number, number] | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const rememberSel = () => {
    const ta = taRef.current;
    if (ta) selRef.current = [ta.selectionStart, ta.selectionEnd];
  };

  function insertEmoji(emoji: string) {
    const ta = taRef.current;
    let [start, end] = selRef.current ?? [content.length, content.length];
    if (ta && document.activeElement === ta) {
      start = ta.selectionStart;
      end = ta.selectionEnd;
    }
    setContent(content.slice(0, start) + emoji + content.slice(end));
    const pos = start + emoji.length;
    selRef.current = [pos, pos];
    setShowEmoji(false);
    requestAnimationFrame(() => {
      ta?.focus();
      if (ta) ta.selectionStart = ta.selectionEnd = pos;
    });
  }

  useEffect(() => {
    if (!showEmoji) return;
    const onDown = (e: MouseEvent) => {
      if (!funcsRef.current?.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showEmoji]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/comments?post=${postId}&postType=${postType}`);
    const data = await res.json();
    setTree(buildTree(data.items ?? []));
  }, [postId, postType]);

  useEffect(() => {
    load();
  }, [load]);

  // Logged-in identity: guest name/email inputs are hidden and the server
  // stamps the comment with the account identity (see createComment).
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setMe(d?.user ? { id: d.user.id, name: d.user.name, email: d.user.email } : null),
      )
      .catch(() => setMe(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    if (!content.trim()) {
      setNotice("请填写评论内容！");
      return;
    }
    if (!me && requireNameEmail && !name.trim()) {
      setNotice("昵称必填！");
      return;
    }
    if (!me && requireNameEmail && !email.trim()) {
      setNotice("邮箱必填！");
      return;
    }
    if (!me && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setNotice("请输入正确的邮箱格式！");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId,
        postType,
        parentId: replyTo ?? undefined,
        authorName: name || "匿名",
        authorEmail: email || undefined,
        authorUrl: url || undefined,
        content,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setContent("");
      setReplyTo(null);
      setNotice(d.isPublic ? "评论已发布" : "评论已提交，等待审核");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setNotice(d.error || "提交失败");
    }
  }

  function render(nodes: C[], depth = 0, parentName?: string) {
    return (
      <ul className={"comment-list" + (depth === 0 ? "" : " sub-list")}>
        {nodes.map((n) => (
          <li key={n.id} id={`comment-item-${n.id}`}>
            <div className="wrapper flex">
              <div
                className="avatar relative flex-shrink-0"
                style={avatarStyle(n.avatarUrl)}
              >
                <div className="highlight"></div>
              </div>
              <div className="body flex-grow">
                <div className="flex items-start">
                  <div className="flex-grow flex items-center justify-between info">
                    {safeUrl(n.authorUrl) ? (
                      <div className="name has-url">
                        <a href={safeUrl(n.authorUrl)!} target="_blank" rel="nofollow noopener noreferrer">
                          {n.authorName}
                        </a>
                      </div>
                    ) : (
                      <div className="name"><span>{n.authorName}</span></div>
                    )}
                    <div className="date">{fmtDate(n.createdAt)}</div>
                  </div>
                  {open && (
                    <span>
                      <div className="flex-shrink-0 reply flex items-center" onClick={() => setReplyTo(n.id)} title="回复">
                        <Reply size={13} />
                      </div>
                    </span>
                  )}
                </div>
                <div className="content has-emoji">
                  {parentName && <span className="parent-info">回复 {parentName}：</span>}
                  {n.content}
                </div>
              </div>
            </div>
            {n.children.length > 0 && render(n.children, depth + 1, n.authorName)}
          </li>
        ))}
      </ul>
    );
  }

  if (!open) {
    return <div className="sf-comment-close">本文已关闭评论。</div>;
  }

  return (
    <div>
      {notice && <div className="sf-comment-close" style={{ color: "var(--primary-color)" }}>{notice}</div>}

      <form onSubmit={submit} className="comment-form sf-comment-form my-5" noValidate>
        {me && (
          <div className="sf-comment-me">
            <span className="sf-comment-me-avatar">{me.name.charAt(0).toUpperCase()}</span>
            <span className="sf-comment-me-meta">
              <span className="sf-comment-me-name">{me.name}</span>
              <span className="sf-comment-me-email">{me.email}</span>
            </span>
          </div>
        )}
        <div className={"input" + (focusCount > 0 ? " is_focused" : "")}>
          <textarea
            ref={taRef}
            {...bindFocus}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onSelect={rememberSel}
            onKeyUp={rememberSel}
            onClick={rememberSel}
            onBlur={() => {
              rememberSel();
              setFocusCount((v) => Math.max(0, v - 1));
            }}
            placeholder="请输入..."
          />
        </div>
        <div className="funcs mx-5" ref={funcsRef}>
          <button
            type="button"
            aria-label="表情"
            title="表情"
            className={showEmoji ? "is-active" : ""}
            onClick={() => setShowEmoji((v) => !v)}
          >
            <Smile size={18} />
          </button>
          {showEmoji && <EmojiPanel onSelect={insertEmoji} />}
        </div>
        {!me && (
        <div className="guest-info fields flex gx-3 mx-5">
          <div className="item">
            <input
              {...bindFocus}
              type="text"
              className="comment-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`昵称${requireNameEmail ? " *" : ""}`}
              autoComplete="nickname"
            />
            <i><User size={15} /></i>
          </div>
          <div className="item">
            <input
              {...bindFocus}
              type="email"
              className="comment-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`邮箱${requireNameEmail ? " *" : ""}`}
              autoComplete="email"
            />
            <i><Mail size={15} /></i>
          </div>
          <div className="item">
            <input
              {...bindFocus}
              type="url"
              className="comment-field"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="个人首页"
              autoComplete="url"
            />
            <i><LinkIcon size={15} /></i>
          </div>
        </div>
        )}
        <div className="mt-5 form-actions text-right">
          {replyTo != null && (
            <button type="button" className="cancel" onClick={() => setReplyTo(null)}>
              <RotateCcw size={12} />
              取消回复
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-submit">
            <Send size={13} />
            {busy ? "提交中…" : replyTo != null ? "回复评论" : "发表评论"}
          </button>
        </div>
      </form>

      {tree.length === 0 ? (
        <div className="sf-comment-close">还没有评论，来抢沙发吧。</div>
      ) : (
        render(tree)
      )}
    </div>
  );
}