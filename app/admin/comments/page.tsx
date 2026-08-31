"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Clock,
  CircleCheck,
  ShieldAlert,
  Trash2,
  Check,
  Ban,
  CircleX,
  type LucideIcon,
} from "lucide-react";

type Comment = {
  id: number;
  postId: number;
  postType: string;
  authorName: string;
  content: string;
  status: "published" | "pending" | "spam";
  createdAt: string;
  ip: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  published: "已发布",
  pending: "待审核",
  spam: "垃圾",
};

export default function CommentsAdmin() {
  const [items, setItems] = useState<Comment[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/comments${qs}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setChecked(new Set());
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: number) {
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function setStatus(ids: number[], status: string) {
    if (!ids.length) return;
    setMsg("处理中…");
    await fetch("/api/comments/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", ids, status }),
    });
    setMsg("");
    load();
  }

  async function remove(ids: number[]) {
    if (!ids.length) return;
    if (!confirm(`确定删除 ${ids.length} 条评论？`)) return;
    await fetch("/api/comments/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids }),
    });
    load();
  }

  const selected = [...checked];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={22} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">评论</h1>
        </div>
        <div className="flex gap-2 text-sm">
          {([
            ["pending", "待审核", Clock],
            ["published", "已发布", CircleCheck],
            ["spam", "垃圾", ShieldAlert],
            ["all", "全部", null],
          ] as [string, string, LucideIcon | null][]).map(([v, l, ic]) => {
            const Ic = ic;
            return (
              <button
                key={v as string}
                onClick={() => setFilter(v as string)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
                  filter === v ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {Ic ? <Ic size={14} /> : null}
                {l as string}
              </button>
            );
          })}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <span className="text-zinc-300">已选 {selected.length} 条</span>
          <button
            onClick={() => setStatus(selected, "published")}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-white"
          >
            <Check size={14} />
            通过
          </button>
          <button
            onClick={() => setStatus(selected, "spam")}
            className="inline-flex items-center gap-1 rounded bg-amber-600 px-3 py-1 text-white"
          >
            <Ban size={14} />
            标为垃圾
          </button>
          <button
            onClick={() => remove(selected)}
            className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-white"
          >
            <Trash2 size={14} />
            删除
          </button>
        </div>
      )}

      {msg && <p className="text-sm text-indigo-300">{msg}</p>}

      {loading ? (
        <p className="text-zinc-400">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-zinc-400">没有评论。</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <input
                type="checkbox"
                checked={checked.has(c.id)}
                onChange={() => toggle(c.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-zinc-100">{c.authorName}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                      c.status === "published"
                        ? "bg-emerald-900 text-emerald-300"
                        : c.status === "spam"
                          ? "bg-red-900 text-red-300"
                          : "bg-amber-900 text-amber-300"
                    }`}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                  <Link
                    href={c.postType === "page" ? `/${c.postId}` : `/blog/${c.postId}`}
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    #{c.postId}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {new Date(c.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{c.content}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  <button
                    onClick={() => setStatus([c.id], "published")}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                  >
                    <Check size={13} />
                    通过
                  </button>
                  <button
                    onClick={() => setStatus([c.id], "spam")}
                    className="inline-flex items-center gap-1 text-amber-400 hover:underline"
                  >
                    <Ban size={13} />
                    垃圾
                  </button>
                  <button
                    onClick={() => remove([c.id])}
                    className="inline-flex items-center gap-1 text-red-400 hover:underline"
                  >
                    <CircleX size={13} />
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
