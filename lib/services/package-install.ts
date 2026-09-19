import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { rmSyncRetry } from "../fs-utils";
import { ValidationError } from "./errors";

/**
 * 主题/插件 zip 包安装器（零三方依赖）。
 *
 * 流程（全程「先落临时目录、校验通过才搬进程序目录」）：
 *   上传 Buffer → 手写 ZIP central directory 解析 + zlib.inflateRaw 解压
 *   → 规范化路径（zip-slip 防护）→ 识别根目录 → 校验 manifest + 入口文件
 *   → 搬进 themes/ 或 plugins/；任何一步失败都删除临时目录，程序目录零残留。
 *
 * 支持：store(0)/deflate(8)、UTF-8 与 GBK 文件名、「包根目录/文件」与
 * 「文件直接在 zip 根」两种打包形式。不支持 ZIP64 / 其余压缩算法（明确报错）。
 */

export type PackageKind = "theme" | "plugin";

/** 上传体积上限 30MB；解压后总体积上限 80MB；条目数上限 2000。 */
export const MAX_ZIP_BYTES = 30 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 80 * 1024 * 1024;
const MAX_ENTRIES = 2000;

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

interface ZipEntry {
  /** 已规范化的 zip 内相对路径（正斜杠）。 */
  name: string;
  data: Buffer;
}

function u16(b: Buffer, o: number): number {
  return b.readUInt16LE(o);
}
function u32(b: Buffer, o: number): number {
  // 用无符号读取；大于 2^31 的字段在安装包场景只会是 0xffffffff（ZIP64），
  // 那里另有明确拒绝。
  return b.readUInt32LE(o);
}

/** 解码 ZIP 文件名：flag bit 11 = UTF-8，否则按简体中文环境常见的 GBK 解。 */
function decodeName(raw: Buffer, flags: number): string {
  if (flags & 0x800) return raw.toString("utf8");
  try {
    return new TextDecoder("gbk").decode(raw);
  } catch {
    return raw.toString("latin1");
  }
}

/** 解析 ZIP（仅读 central directory + local header 定位数据）。 */
export function unzip(buf: Buffer): ZipEntry[] {
  // EOCD 位于文件尾（可带 comment），在最后 64KB 内倒序找签名。
  let eocd = -1;
  const scanStart = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= scanStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ValidationError("不是有效的 ZIP 文件（找不到中央目录）");

  const total = u16(buf, eocd + 10);
  const cdSize = u32(buf, eocd + 12);
  let cdOffset = u32(buf, eocd + 16);
  if (cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ValidationError("暂不支持 ZIP64 格式的压缩包");
  }
  if (cdOffset + cdSize > buf.length) {
    throw new ValidationError("ZIP 中央目录已损坏");
  }

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (u32(buf, p) !== CD_SIG) {
      throw new ValidationError("ZIP 中央目录已损坏");
    }
    const flags = u16(buf, p + 8);
    const method = u16(buf, p + 10);
    const compSize = u32(buf, p + 20);
    const uncompSize = u32(buf, p + 24);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const localOffset = u32(buf, p + 42);
    const name = decodeName(buf.subarray(p + 46, p + 46 + nameLen), flags);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // 目录条目无需落盘
    if (entries.length >= MAX_ENTRIES) {
      throw new ValidationError("压缩包内文件数量超出上限");
    }

    if (u32(buf, localOffset) !== LOCAL_SIG) {
      throw new ValidationError("ZIP 本地文件头已损坏");
    }
    const localNameLen = u16(buf, localOffset + 26);
    const localExtraLen = u16(buf, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > buf.length) {
      throw new ValidationError("ZIP 数据区已损坏");
    }
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: MAX_UNPACKED_BYTES });
      } catch {
        throw new ValidationError(`文件「${name}」解压失败，压缩数据已损坏`);
      }
    } else {
      throw new ValidationError(`暂不支持的压缩方式（method=${method}），请用标准 deflate 重新打包`);
    }
    entries.push({ name: normalizeZipPath(name), data });
  }
  if (entries.length === 0) throw new ValidationError("压缩包是空的");
  return entries;
}

/** zip-slip 防护：拒绝绝对路径、盘符、任何上层跳转。 */
function normalizeZipPath(name: string): string {
  let s = name.replace(/\\/g, "/").replace(/^[a-zA-Z]:/, "").replace(/^\/+/, "");
  const segs = s.split("/").filter((seg) => seg.length && seg !== ".");
  if (segs.some((seg) => seg === "..")) {
    throw new ValidationError("压缩包含非法路径（.. 跳转），已拒绝安装");
  }
  s = segs.join("/");
  if (!s) throw new ValidationError("压缩包内含空文件名条目");
  return s;
}

/** 去掉 macOS 打包垃圾；若所有文件共享同一个顶层目录则剥掉它。 */
function stripWrapper(entries: ZipEntry[]): { root: ZipEntry[]; wrapper: string | null } {
  const clean = entries.filter(
    (e) => !e.name.startsWith("__MACOSX/") && e.name !== ".DS_Store",
  );
  if (clean.length === 0) {
    throw new ValidationError("压缩包只包含系统垃圾文件（__MACOSX/.DS_Store）");
  }
  const tops = new Set(clean.map((e) => e.name.split("/")[0]));
  if (tops.size === 1) {
    const wrapper = [...tops][0];
    const root = clean
      .map((e) => ({ name: e.name.slice(wrapper.length + 1), data: e.data }))
      .filter((e) => e.name);
    if (root.length) return { root, wrapper };
  }
  return { root: clean, wrapper: null };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,59}$/;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9一-龥]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || ""
  );
}

const THEME_ENTRY = ["index.ts", "index.tsx"];
const PLUGIN_ENTRY = ["index.ts", "index.tsx", "index.js", "index.mjs"];

export interface InstalledPackage {
  kind: PackageKind;
  slug: string;
  name: string;
}

/**
 * 校验并安装一个主题/插件包，返回最终落盘的 slug/名称。
 * 失败时抛出 ValidationError（中文提示），临时目录必定被清理。
 */
export function installPackage(kind: PackageKind, buf: Buffer): InstalledPackage {
  if (!buf || buf.length < 22) throw new ValidationError("文件内容不是有效的 ZIP");
  if (buf.length > MAX_ZIP_BYTES) {
    throw new ValidationError(`安装包不能超过 ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB`);
  }

  const entries = unzip(buf);
  const unpacked = entries.reduce((sum, e) => sum + e.data.length, 0);
  if (unpacked > MAX_UNPACKED_BYTES) {
    throw new ValidationError("解压后体积超出上限，请精简安装包");
  }
  const { root, wrapper } = stripWrapper(entries);

  const manifestName = kind === "theme" ? "manifest.json" : "plugin.json";
  const manifestEntry = root.find((e) => e.name === manifestName);
  if (!manifestEntry) {
    throw new ValidationError(
      kind === "theme"
        ? "不是合规的主题包：根目录缺少 manifest.json"
        : "不是合规的插件包：根目录缺少 plugin.json",
    );
  }

  let manifest: { name?: unknown; slug?: unknown };
  try {
    manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch {
    throw new ValidationError(`${manifestName} 不是合法的 JSON`);
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    throw new ValidationError(`${manifestName} 缺少有效的 name 字段`);
  }
  const entryCandidates = kind === "theme" ? THEME_ENTRY : PLUGIN_ENTRY;
  const hasEntry = root.some((e) => entryCandidates.includes(e.name));
  if (!hasEntry) {
    throw new ValidationError(
      kind === "theme"
        ? "不是合规的主题包：缺少入口文件 index.ts（或 index.tsx）"
        : "不是合规的插件包：缺少入口文件 index.ts / index.js",
    );
  }

  // 落盘目录名：优先 zip 顶层目录名（最常见的「打包整个文件夹」形式），
  // 其次 manifest.slug / name；目录名是程序发现机制的权威标识。
  let slug = wrapper || (typeof manifest.slug === "string" ? manifest.slug : "") || slugify(manifest.name);
  slug = slug.toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new ValidationError(
      `目录标识「${slug}」不合法，仅允许字母、数字、连字符且以字母数字开头`,
    );
  }

  const dest = path.join(process.cwd(), kind === "theme" ? "themes" : "plugins", slug);
  if (fs.existsSync(dest)) {
    throw new ValidationError(
      `${kind === "theme" ? "主题" : "插件"}「${slug}」已存在，请勿重复安装`,
    );
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `oboe-${kind}-`));
  try {
    for (const e of root) {
      // 二次防护：规范化后再 resolve，确保绝不越出临时目录
      const target = path.resolve(tmp, e.name);
      if (target !== path.resolve(tmp) && !target.startsWith(path.resolve(tmp) + path.sep)) {
        throw new ValidationError("压缩包含非法路径，已拒绝安装");
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.data);
    }
    // 原子性尽量：rename 同盘瞬时完成；跨盘（罕见）退化为复制。
    try {
      fs.renameSync(tmp, dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
      fs.cpSync(tmp, dest, { recursive: true });
      rmSyncRetry(tmp);
    }
  } catch (e) {
    // 失败即清理临时目录与可能已半写入的目标，程序目录不残留垃圾
    rmSyncRetry(tmp);
    if (fs.existsSync(dest)) rmSyncRetry(dest);
    throw e;
  }

  return { kind, slug, name: manifest.name.trim() };
}
