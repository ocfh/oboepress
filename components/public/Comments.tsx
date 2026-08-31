"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageCircle, Reply, Send } from "lucide-react";
import type { CommentConfig } from "@/lib/comments-config";
import ThirdPartyComments from "@/components/public/comments/CommentProviders";

type C = {
  id: number;
  parentId: number | null;
  authorName: string;
  content: string;
  createdAt: string;
  avatarUrl?: string | null;
  children: C[];
};

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
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
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
      avatarSize={cfg.avatar.size}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Built-in comment system (nvPress-style .comment-list)                       */
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
  avatarSize,
}: {
  postId: number;
  postType: string;
  open: boolean;
  requireNameEmail: boolean;
  avatarSize: number;
}) {
  const [tree, setTree] = useState<C[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/comments?post=${postId}&postType=${postType}`);
    const data = await res.json();
    setTree(buildTree(data.items ?? []));
  }, [postId, postType]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    if (requireNameEmail && (!name.trim() || !email.trim())) {
      setNotice("请填写昵称与邮箱");
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
                style={{ ...avatarStyle(n.avatarUrl), width: avatarSize, height: avatarSize }}
              >
                <div className="highlight"></div>
              </div>
              <div className="body flex-grow">
                <div className="flex items-start">
                  <div className="flex-grow flex items-center justify-between info">
                    <div className="name">{n.authorName}</div>
                    <div className="date">{fmtDate(n.createdAt)}</div>
                  </div>
                  {open && (
                    <span>
                      <div className="reply flex items-center" onClick={() => setReplyTo(n.id)} title="回复">
                        <Reply size={12} />
                        <span className="reply-label">回复</span>
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

      {replyTo != null && (
        <div className="sf-comment-close" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          回复中…
          <button
            onClick={() => setReplyTo(null)}
            className="reply flex items-center"
            style={{ border: "none", marginTop: 0 }}
          >
            <Reply size={12} />
            <span className="reply-label">取消回复</span>
          </button>
        </div>
      )}

      <form onSubmit={submit} className="sf-comment-form">
        <div className="fields">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="昵称"
            className="comment-field"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            className="comment-field"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="网站（可选）"
            className="comment-field"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="说点什么…"
          rows={4}
          required
        />
        <button type="submit" disabled={busy} className="btn-submit">
          <Send size={15} />
          {busy ? "提交中…" : "发表评论"}
        </button>
      </form>

      {tree.length === 0 ? (
        <div className="sf-comment-close">还没有评论，来抢沙发吧。</div>
      ) : (
        render(tree)
      )}
    </div>
  );
}