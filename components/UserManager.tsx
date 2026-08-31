"use client";

import { useEffect, useState } from "react";
import { Users, UserPlus, Trash2, CircleUser } from "lucide-react";

type UserItem = {
  id: number;
  email: string;
  name: string;
  role: string;
  bio: string | null;
};

const ROLES = ["admin", "editor", "author", "subscriber"];

export default function UserManager() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("author");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) setItems(await res.json());
    else setMsg("无权访问用户列表");
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    if (res.ok) {
      setEmail("");
      setName("");
      setPassword("");
      setRole("author");
      setMsg("已创建 ✓");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "创建失败");
    }
  }

  async function remove(id: number) {
    if (!confirm("删除该用户？")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "删除失败");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Users size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">用户</h1>
      </div>

      <form
        onSubmit={add}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <div>
          <p className="mb-1 text-sm text-zinc-300">邮箱</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-zinc-300">姓名</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-zinc-300">密码</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-zinc-300">角色</p>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <UserPlus size={16} />
          创建用户
        </button>
        {msg && <span className="text-sm text-emerald-400">{msg}</span>}
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">姓名</th>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {items.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <CircleUser size={16} className="text-zinc-500" />
                    {u.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                <td className="px-4 py-3 text-indigo-400">{u.role}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(u.id)}
                    className="inline-flex items-center gap-1 rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                    title="删除"
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  还没有用户，或无权查看。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
