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

/** 自定义验证码校验接口允许的 HTTP 方法（GET 时请把 {{token}} 拼进地址）。 */
export type CaptchaVerifyMethod = "POST" | "GET" | "PUT";

export interface AdminSecurity {
  /** 开启伪装：未登录访问 /admin* 一律 404。 */
  entryEnabled: boolean;
  /** 秘密登录入口，如 /secret-door，必须以单斜杠开头。 */
  entryPath: string;
  /** 登录是否需要验证码。 */
  captchaEnabled: boolean;
  /** builtin=本地 SVG 图形验证码；custom=把凭证 POST 到自定义接口校验。 */
  captchaMode: CaptchaMode;
  /** custom 模式的校验接口地址，支持 {{token}} 模板，返回 {ok:true} 视为通过。 */
  captchaVerifyUrl: string;
  /** 校验请求的 HTTP 方法。 */
  captchaVerifyMethod: CaptchaVerifyMethod;
  /** 校验请求头原文：JSON 对象或每行 `Key: Value`。 */
  captchaVerifyHeaders: string;
  /** 校验请求体模板，{{token}} 替换为用户输入；GET 方法不发送请求体。 */
  captchaVerifyBody: string;
  /** 成功判定规则，形如 `code=200`（左侧支持点路径）；留空沿用 2xx+ok/success。 */
  captchaVerifySuccess: string;
  /** 登录失败限流：滑动窗口内连续失败达到阈值后临时拒绝登录。 */
  throttleEnabled: boolean;
  /** 窗口内允许的最大失败次数。 */
  throttleMaxFailures: number;
  /** 统计窗口（分钟），同时也是锁定时长（窗口滑过后自动解锁）。 */
  throttleWindowMinutes: number;
}

const OPTION_KEY = "adminSecurity";

const DEFAULT_SECURITY: AdminSecurity = {
  entryEnabled: false,
  entryPath: "/secret-login",
  captchaEnabled: false,
  captchaMode: "builtin",
  captchaVerifyUrl: "",
  captchaVerifyMethod: "POST",
  captchaVerifyHeaders: "",
  // 零配置默认即旧行为：POST JSON {"token": 用户输入}。
  captchaVerifyBody: '{"token":"{{token}}"}',
  captchaVerifySuccess: "",
  throttleEnabled: true,
  throttleMaxFailures: 5,
  throttleWindowMinutes: 15,
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

/** 数字设置项的容错合并：非数 / NaN 时保留现值，并夹取到允许区间。 */
function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 文本设置项的容错合并：非字符串保留现值，trim 后超长直接 422（配置错误要当场暴露）。 */
function clampText(raw: unknown, fallback: string, max: number, label: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (s.length > max) throw new ValidationError(`${label}过长（最多 ${max} 个字符）`);
  return s;
}

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
    captchaVerifyMethod:
      input.captchaVerifyMethod === "POST" ||
      input.captchaVerifyMethod === "GET" ||
      input.captchaVerifyMethod === "PUT"
        ? input.captchaVerifyMethod
        : current.captchaVerifyMethod,
    captchaVerifyHeaders: clampText(
      input.captchaVerifyHeaders,
      current.captchaVerifyHeaders,
      2000,
      "验证码请求头",
    ),
    captchaVerifyBody: clampText(
      input.captchaVerifyBody,
      current.captchaVerifyBody,
      2000,
      "验证码请求体模板",
    ),
    captchaVerifySuccess: clampText(
      input.captchaVerifySuccess,
      current.captchaVerifySuccess,
      100,
      "验证码成功判定规则",
    ),
    throttleEnabled:
      typeof input.throttleEnabled === "boolean"
        ? input.throttleEnabled
        : current.throttleEnabled,
    throttleMaxFailures: clampInt(
      input.throttleMaxFailures,
      current.throttleMaxFailures,
      3,
      50,
    ),
    throttleWindowMinutes: clampInt(
      input.throttleWindowMinutes,
      current.throttleWindowMinutes,
      1,
      1440,
    ),
  };
  // 内置模式不需要外部接口配置，清掉避免残留配置在切回 custom 时静默生效。
  if (next.captchaMode === "builtin") {
    next.captchaVerifyUrl = "";
    next.captchaVerifyHeaders = "";
    next.captchaVerifyBody = DEFAULT_SECURITY.captchaVerifyBody;
    next.captchaVerifySuccess = "";
  }

  next.entryPath = await normalizePublicPath(next.entryPath);

  if (next.captchaEnabled && next.captchaMode === "custom") {
    if (!next.captchaVerifyUrl) {
      throw new ValidationError("请填写验证码校验接口地址");
    }
    // 先渲染掉 {{token}} 再校验 URL 合法性（占位符在 query 中是合法字符）。
    const renderedUrl = next.captchaVerifyUrl.replace(
      /\{\{\s*token\s*\}\}/g,
      "x",
    );
    let u: URL;
    try {
      u = new URL(renderedUrl);
    } catch {
      throw new ValidationError("验证码校验接口地址不是合法 URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new ValidationError("校验接口只支持 http / https 地址");
    }
    if (next.captchaVerifyUrl.length > 255) {
      throw new ValidationError("校验接口地址过长（最多 255 个字符）");
    }
    // 请求头若写成 JSON 对象，保存时就拦住语法错误，别等登录时才报错。
    if (next.captchaVerifyHeaders.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(next.captchaVerifyHeaders) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("not-object");
        }
      } catch {
        throw new ValidationError("验证码请求头 JSON 格式不正确");
      }
    }
    // 成功规则必须是 `字段路径=期望值`；点路径留给运行时取，这里只校形态。
    if (next.captchaVerifySuccess && !next.captchaVerifySuccess.includes("=")) {
      throw new ValidationError("成功判定规则格式应为 code=200 这样的 路径=值");
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
