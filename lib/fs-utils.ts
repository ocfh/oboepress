import fs from "node:fs";

/**
 * 递归删除 + Windows 退避重试。
 *
 * 刚落盘的主题/插件文件会被杀软实时扫描、资源索引器或 Next 文件监视器短暂
 * 占用，此时 rmSync 会抛 EBUSY/EPERM/ENOTEMPTY（典型现象：删除新上传主题的
 * index.tsx 报 500）。这几个错误码都是瞬时的，等句柄释放后重试即可。
 */
export function rmSyncRetry(target: string, attempts = 8): void {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      if (!fs.existsSync(target)) return;
    } catch (e) {
      lastErr = e;
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") throw e;
    }
    // 同步退避（删除是罕见操作，短暂阻塞事件循环可接受）
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (i + 1));
  }
  if (fs.existsSync(target)) throw lastErr ?? new Error(`删除失败：${target}`);
}
