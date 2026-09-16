"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SetupPage() {
  const router = useRouter();
  const [siteTitle, setSiteTitle] = useState("OboePress");
  const [siteDescription, setSiteDescription] = useState(
    "一个 Serverless 友好的内容管理系统",
  );
  const [tagline, setTagline] = useState("");
  const [footerText, setFooterText] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [driver, setDriver] = useState<"pglite" | "postgres">("pglite");
  const [dbUrl, setDbUrl] = useState("");
  const [storage, setStorage] = useState<"local" | "vercel-blob">("local");
  const [blobToken, setBlobToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Persist the chosen database driver + storage before completing setup.
    if (driver === "postgres" && !dbUrl.trim()) {
      setError("选择远程数据库时请填写连接串");
      setLoading(false);
      return;
    }
    if (storage === "vercel-blob" && !blobToken.trim()) {
      setError("选择 Vercel Blob 时请填写 Blob 读写令牌");
      setLoading(false);
      return;
    }
    const dbRes = await fetch("/api/db-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver,
        url: dbUrl.trim(),
        storage,
        blobToken: blobToken.trim(),
      }),
    });
    if (!dbRes.ok) {
      const dbErr = await dbRes.json().catch(() => ({}));
      setError(dbErr.error || "数据库配置失败");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteTitle,
        siteDescription,
        tagline,
        footerText,
        email,
        name,
        password,
      }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "初始化失败");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8"
      >
        <h1 className="text-2xl font-bold text-indigo-400">初始化 OboePress</h1>
        <p className="mt-1 text-sm text-zinc-400">
          检测到系统尚未配置，请创建站长账号并填写站点信息。
        </p>

        <fieldset className="mt-6 rounded-lg border border-zinc-800 p-4">
          <legend className="px-2 text-xs text-zinc-500">数据库</legend>
          <div className="flex gap-3">
            {((
              [
                ["pglite", "本地内置 (PGlite)"],
                ["postgres", "远程数据库"],
              ] as const
            ))
            .map(([val, label]) => (
              <label
                key={val}
                className={`flex-1 cursor-pointer rounded-md border p-3 text-sm ${
                  driver === val
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  value={val}
                  checked={driver === val}
                  onChange={() => setDriver(val)}
                />
                {label}
              </label>
            ))}
          </div>

          {driver === "pglite" ? (
            <p className="mt-3 text-xs text-zinc-400">
              推荐：零配置、无需外部服务，数据保存在本地 .data 目录。
            </p>
          ) : (
            <>
              <p className="mt-3 text-xs text-zinc-400">
                推荐 Neon（免费档，空闲自动休眠不烧额度）或 Supabase。连接串形如：
              </p>
              <code className="mt-1 block overflow-x-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                postgresql://user:pass@host:5432/dbname?sslmode=require
              </code>
              <label className="mt-3 block text-sm text-zinc-300">连接串</label>
              <input
                value={dbUrl}
                onChange={(e) => setDbUrl(e.target.value)}
                placeholder="postgresql://…"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                spellCheck={false}
              />
            </>
          )}
        </fieldset>

        <fieldset className="mt-6 rounded-lg border border-zinc-800 p-4">
          <legend className="px-2 text-xs text-zinc-500">图片存储</legend>
          <div className="flex gap-3">
            {((
              [
                ["local", "本地 (方案 A)"],
                ["vercel-blob", "Vercel Blob (方案 B)"],
              ] as const
            ))
            .map(([val, label]) => (
              <label
                key={val}
                className={`flex-1 cursor-pointer rounded-md border p-3 text-sm ${
                  storage === val
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  value={val}
                  checked={storage === val}
                  onChange={() => setStorage(val)}
                />
                {label}
              </label>
            ))}
          </div>

          {storage === "local" ? (
            <p className="mt-3 text-xs text-zinc-400">
              图片写入 content/uploads 并随 Git 提交，由 Vercel 构建部署。适合静态、少量图片。
            </p>
          ) : (
            <>
              <p className="mt-3 text-xs text-zinc-400">
                后台传图自动上云，无需手动 Git 提交，适合频繁传图。免费额度内够用，超量后按量计费。令牌在 Vercel 面板的 Storage → Blob 中创建：
              </p>
              <label className="mt-3 block text-sm text-zinc-300">
                BLOB_READ_WRITE_TOKEN
              </label>
              <input
                value={blobToken}
                onChange={(e) => setBlobToken(e.target.value)}
                placeholder="vercel_blob_rw_…"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                spellCheck={false}
              />
            </>
          )}
        </fieldset>

        <fieldset className="mt-6 rounded-lg border border-zinc-800 p-4">
          <legend className="px-2 text-xs text-zinc-500">站点信息</legend>
          <label className="block text-sm text-zinc-300">站点名称</label>
          <input
            value={siteTitle}
            onChange={(e) => setSiteTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            required
          />
          <label className="mt-4 block text-sm text-zinc-300">站点描述</label>
          <input
            value={siteDescription}
            onChange={(e) => setSiteDescription(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <label className="mt-4 block text-sm text-zinc-300">副标题 / 标语</label>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <label className="mt-4 block text-sm text-zinc-300">页脚文字</label>
          <input
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </fieldset>

        <fieldset className="mt-4 rounded-lg border border-zinc-800 p-4">
          <legend className="px-2 text-xs text-zinc-500">站长账号</legend>
          <label className="block text-sm text-zinc-300">姓名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            required
          />
          <label className="mt-4 block text-sm text-zinc-300">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            required
          />
          <label className="mt-4 block text-sm text-zinc-300">密码（至少 8 位）</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            required
            minLength={8}
          />
        </fieldset>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "初始化中…" : "完成初始化"}
        </button>

        <p className="mt-4 text-center text-xs">
          <Link href="/" className="text-indigo-400 hover:underline">
            ← 返回站点首页
          </Link>
        </p>
      </form>
    </div>
  );
}
