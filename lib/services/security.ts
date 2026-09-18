import { cache } from "react";
import { getOption, setOption } from "./options";
import { getPermalinkConfig } from "./links";
import { ValidationError } from "./errors";

/**
 * 后台入口伪装（对标 Typecho / WordPress 的 Hide Login 类插件）。
 *
 * 开启后未登录访客看到的整个 /admin 树（含 /admin/login）都是 404，
 * 真正的登录页只在自定义秘密入口路径渲染。配置存 options KV，免迁移；
 * 所有门控必须放在 node 侧（layout / 路由），因为 middleware 跑在
 * edge runtime，读不到 PGlite。
 */
export type CaptchaMode = "builtin" | "custom";

export interface AdminSecurity {
  /** 开启伪装：未登录访问 /admin* 一律 404。 */
  entryEnabled: boolean;
  /** 秘密登录入口，如 /secret-door，必须以单斜杠开头。 */
  entryPath: string;
  /** 登录是否需要验证码。 */
  captchaEnabled: boolean;
  /** builtin=本地 SVG 图形验证码；custom=把凭证 POST 到自定义接口校验。 */
  captchaMode: CaptchaMode;
  /** custom 模式的校验接口地址，返回 {ok:true} 视为通过。 */
  captchaVerifyUrl: string;
}

const OPTION_KEY = "adminSecurity";

const DEFAULT_SECURITY: AdminSecurity = {
  entryEnabled: false,
  entryPath: "/secret-login",
  captchaEnabled: false,
  captchaMode: "builtin",
  captchaVerifyUrl: "",
};

/** 入口首段不得占用的系统保留路径。 */
const RESERVED_SEGMENTS = new Set([
  "admin",
  "api",
  "_next",
  "search",
  "archives",
  "feed.xml",
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
  "theme-assets",
  "uploads",
  "static",
  "manifest.json",
  "manifest.webmanifest",
]);

const ENTRY_PATH_RE = /^\/[a-z0-9][a-z0-9-_/]*$/;

/**
 * 规范化并校验对外公开的自定义路径（伪装登录入口 / 会员注册页等）：
 * 小写、去重斜杠/尾斜杠，仅允许字母数字 - _ /，1~3 段、总长 ≤ 64；
 * 不得占用保留段，也不得撞上正在使用的固定链接前缀首段。
 */
export async function normalizePublicPath(raw: string): Promise<string> {
  const path = raw
    .trim()
    .replace(/^\/+/, "/")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/")
    .toLowerCase();

  if (!ENTRY_PATH_RE.test(path)) {
    throw new ValidationError(
      "路径只能包含字母、数字、-、_、/，需以 / 开头且不以 / 结尾",
    );
  }
  if (path.length > 64) throw new ValidationError("路径过长（最多 64 个字符）");
  const segments = path.split("/").filter(Boolean);
  if (segments.length > 3) throw new ValidationError("路径最多 3 层目录");

  const first = segments[0];
  if (RESERVED_SEGMENTS.has(first)) {
    throw new ValidationError(`/${first} 是系统保留路径，请更换`);
  }

  const permalink = await getPermalinkConfig();
  for (const base of [
    permalink.postBase,
    permalink.pageBase,
    permalink.categoryBase,
    permalink.tagBase,
  ]) {
    const seg = base.split("/").filter(Boolean)[0];
    if (seg && seg === first) {
      throw new ValidationError(`路径与固定链接前缀 /${base} 冲突，请更换`);
    }
  }
  return path;
}

/** 请求级去重：root layout 的 metadata 与渲染、catch-all、验证码/登录
 *  接口在同一次请求里会反复读取，合并成一次 KV 读取。 */
export const getAdminSecurity = cache(async (): Promise<AdminSecurity> => {
  const stored = (await getOption<Partial<AdminSecurity>>(OPTION_KEY, {})) ?? {};
  return { ...DEFAULT_SECURITY, ...stored };
});

/**
 * 规范化并校验入口路径：
 * 小写、去重斜杠/尾斜杠，仅允许字母数字 - _ /，1~3 段、总长 ≤ 64；
 * 不得占用保留段，也不得撞上正在使用的固定链接前缀首段。
 */
export async function saveAdminSecurity(
  input: Partial<AdminSecurity>,
): Promise<AdminSecurity> {
  const current = await getAdminSecurity();
  const next: AdminSecurity = {
    entryEnabled:
      typeof input.entryEnabled === "boolean"
        ? input.entryEnabled
        : current.entryEnabled,
    entryPath:
      typeof input.entryPath === "string" ? input.entryPath : current.entryPath,
    captchaEnabled:
      typeof input.captchaEnabled === "boolean"
        ? input.captchaEnabled
        : current.captchaEnabled,
    captchaMode:
      input.captchaMode === "builtin" || input.captchaMode === "custom"
        ? input.captchaMode
        : current.captchaMode,
    captchaVerifyUrl:
      typeof input.captchaVerifyUrl === "string"
        ? input.captchaVerifyUrl.trim()
        : current.captchaVerifyUrl,
  };
  // 内置模式不需要外部地址，清掉避免残留配置在切回 custom 时静默生效。
  if (next.captchaMode === "builtin") next.captchaVerifyUrl = "";

  next.entryPath = await normalizePublicPath(next.entryPath);

  if (next.captchaEnabled && next.captchaMode === "custom") {
    if (!next.captchaVerifyUrl) {
      throw new ValidationError("请填写验证码校验接口地址");
    }
    let u: URL;
    try {
      u = new URL(next.captchaVerifyUrl);
    } catch {
      throw new ValidationError("验证码校验接口地址不是合法 URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new ValidationError("校验接口只支持 http / https 地址");
    }
    if (next.captchaVerifyUrl.length > 255) {
      throw new ValidationError("校验接口地址过长（最多 255 个字符）");
    }
  }

  await setOption(OPTION_KEY, next);
  return next;
}

/**
 * 伪装开启时，登录 / 验证码等公开接口只接受秘密入口页发起的同源请求
 * （浏览器同源请求自动带完整 Referer 路径）。entryEnabled=false 时不限制，
 * 普通 /admin/login 页面照常调用这些接口。
 */
export function isEntryReferer(req: Request, sec: AdminSecurity): boolean {
  if (!sec.entryEnabled) return true;
  let pathname = "";
  try {
    pathname = new URL(req.headers.get("referer") ?? "").pathname;
  } catch {
    pathname = "";
  }
  return pathname === sec.entryPath;
}
