"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

/**
 * 主题/插件 zip 上传安装入口（后台两个管理器共用）。
 * 仅选择文件、POST multipart；合规性校验、解压与失败清理全部在服务端完成。
 */
export default function PackageUpload({
  kind,
  onInstalled,
}: {
  kind: "theme" | "plugin";
  onInstalled?: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        kind === "theme" ? "/api/themes/upload" : "/api/plugins/upload",
        { method: "POST", body: fd },
      );
      const json = (await res.json().catch(() => ({}))) as {
        data?: { name?: string };
        error?: string;
      };
      if (!res.ok) {
        setErr(json.error || "安装失败，请检查压缩包");
        return;
      }
      setOkMsg(
        `「${json.data?.name ?? "安装包"}」安装成功` +
          (kind === "plugin" ? "，默认停用，启用后生效" : ""),
      );
      await onInstalled?.();
    } catch {
      setErr("网络错误，上传失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <UploadCloud size={13} />
          )}
          {busy ? "安装中…" : "上传 zip 安装"}
        </button>
        <span className="text-xs text-zinc-500">
          {kind === "theme"
            ? "主题包根目录需包含 manifest.json 与 index.ts"
            : "插件包根目录需包含 plugin.json 与 index 入口"}
          ；不合规的压缩包会被拒绝且不保留临时文件
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
      {err && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {err}
        </p>
      )}
      {okMsg && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 size={12} />
          {okMsg}
        </p>
      )}
    </div>
  );
}
