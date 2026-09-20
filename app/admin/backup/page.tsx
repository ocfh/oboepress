"use client";

import { useMemo, useRef, useState } from "react";
import { DatabaseBackup, Download, TriangleAlert, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

const cardCls = "rounded-xl border border-zinc-800 bg-zinc-900/30 p-6";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
const btnDanger =
  "inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40";

interface BackupMeta {
  createdAt?: string;
  tables?: Record<string, unknown[]>;
  error?: string;
}

export default function BackupPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<BackupMeta | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalRows = useMemo(
    () => (meta?.tables ? Object.values(meta.tables).reduce((n, rows) => n + rows.length, 0) : 0),
    [meta],
  );

  async function onPick(f: File | null) {
    setFile(f);
    setResult(null);
    setError(null);
    setMeta(null);
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (parsed?.kind !== "oboepress-db-backup" || typeof parsed.tables !== "object") {
        setMeta({ error: "该文件不是 OboePress 整库备份" });
        return;
      }
      setMeta({ createdAt: parsed.createdAt, tables: parsed.tables });
    } catch {
      setMeta({ error: "文件不是合法 JSON" });
    }
  }

  async function onRestore() {
    if (!file || !meta || meta.error || confirm !== "RESTORE" || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("confirm", confirm);
      const res = await fetch("/api/admin/backup", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `恢复失败（${res.status}）`);
      const counts = Object.entries(data.restored ?? {}) as [string, number][];
      const lines = [
        `恢复完成：${counts.length} 张表、${counts.reduce((n, [, c]) => n + c, 0)} 行已导回。`,
        (data.missingTables ?? []).length
          ? `跳过备份中已不存在的表：${(data.missingTables as string[]).join("、")}`
          : null,
        data.autoSnapshot ? `恢复前快照已保存在服务器：${data.autoSnapshot}` : null,
        "全部缓存已失效、插件已重载；若当前登录失效，请用备份中的管理员账号重新登录。",
      ].filter(Boolean);
      setResult(lines.join("\n"));
      setFile(null);
      setMeta(null);
      setConfirm("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2">
        <DatabaseBackup size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">备份与恢复</h1>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        整库级备份覆盖数据库中的全部数据表（文章、页面、评论、用户、会员、设置、插件配置、安全日志等），
        可在不同服务器与数据库驱动间迁移。备份不包含 <code>uploads</code> 媒体文件，需另行备份。
      </p>

      <section className={`mt-6 space-y-4 ${cardCls}`}>
        <h2 className="text-sm font-semibold text-zinc-200">下载整库备份</h2>
        <p className="text-xs text-zinc-500">
          导出为单个 JSON 文件，建议在升级程序或批量改动前下载留存。
        </p>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <Download size={16} />
          下载数据库备份
        </a>
      </section>

      <section className={`mt-6 space-y-4 ${cardCls}`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <TriangleAlert size={15} className="text-red-400" />
          从备份恢复（覆盖式）
        </h2>
        <div className="space-y-1 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-xs leading-5 text-red-200/90">
          <p>恢复将用备份内容整体替换当前数据库，现有全部数据会被清空且不可撤销。</p>
          <p>执行前系统会自动在服务器 .data/backups 目录留一份当前库快照（保留最近 10 份）。</p>
          <p>恢复后所有登录会话可能失效，需用备份中的账号重新登录。</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">备份文件</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-2 file:text-sm file:text-zinc-100 hover:file:bg-zinc-600"
          />
          {meta?.error && <p className="mt-2 text-xs text-red-400">{meta.error}</p>}
          {meta?.tables && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
              <p className="text-zinc-200">
                备份时间：{meta.createdAt ? new Date(meta.createdAt).toLocaleString() : "未知"}
              </p>
              <p>
                含 {Object.keys(meta.tables).length} 张表、共 {totalRows} 行数据。
              </p>
              <p className="mt-1 break-all text-zinc-500">
                {Object.keys(meta.tables).join("、")}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            输入 <span className="font-mono text-red-300">RESTORE</span> 确认覆盖
          </label>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="w-48 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-red-500"
          />
        </div>

        <button
          type="button"
          onClick={onRestore}
          disabled={!file || !meta || !!meta.error || confirm !== "RESTORE" || busy}
          className={btnDanger}
        >
          <Upload size={16} />
          {busy ? "正在恢复……" : "执行整库恢复"}
        </button>

        {error && <p className="whitespace-pre-wrap text-xs text-red-400">{error}</p>}
        {result && (
          <p className="whitespace-pre-wrap rounded-md border border-emerald-900/60 bg-emerald-950/30 p-3 text-xs leading-5 text-emerald-200/90">
            {result}
          </p>
        )}
      </section>
    </div>
  );
}
