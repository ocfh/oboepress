import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import { users } from "@/db/schema";
import type { Role } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth";
import { getOption, setOption } from "./options";
import { addPasswordlessMark } from "./passwordless-mark";
import { getAdminSecurity, normalizePublicPath } from "./security";
import { getNotifySettings } from "./notify";
import { verifyCode } from "./verify-codes";
import { ValidationError } from "./errors";

/**
 * 前台会员注册（对标参考站的公开注册能力）。
 *
 * - 配置走 options KV（key=memberSettings），免表迁移；与「后台安全」一致，
 *   所有门控都在 node 侧完成（middleware 在 edge，读不到 PGlite）。
 * - 注册页路径可改，在前台 catch-all 中分流；内容实体路径优先于注册路径。
 * - 注册验证码复用「后台安全」里的 builtin/custom 通道，仅开关独立。
 * - 注册成功的会员默认 role=subscriber（仅 content:read），管理员可改为
 *   author（可在后台撰写自己的内容）。
 */

const OPTION_KEY = "memberSettings";

export type MemberDefaultRole = Extract<Role, "subscriber" | "author">;

export interface MemberSettings {
  /** 总开关：关闭后注册页 404、注册接口 404。 */
  registerEnabled: boolean;
  /** 注册页路径，默认 /user，必须以单斜杠开头；不能出现 admin 段。 */
  registerPath: string;
  /** 注册时昵称是否必填；关闭后留空由系统生成唯一昵称。 */
  nameRequired: boolean;
  /** 注册时密码是否必填；关闭后可免密注册（随机未知哈希 + nopassword 标记）。 */
  passwordRequired: boolean;
  /** 注册时邮箱是否必填；关闭后邮箱字段为可选。 */
  emailRequired: boolean;
  /** 注册时手机号是否必填；关闭后手机号字段为可选（仍可填）。 */
  phoneRequired: boolean;
  /** 注册是否需要验证码（方式与校验接口复用后台安全配置）。 */
  captchaEnabled: boolean;
  /** 邀请制：开启后注册必须提交一个管理员预设的有效邀请码。 */
  inviteOnly: boolean;
  /** 有效邀请码列表（明文短码，校验时忽略大小写）。 */
  inviteCodes: string[];
  /** 新注册用户的默认角色：订阅者 / 作者。 */
  defaultRole: MemberDefaultRole;
}

const DEFAULT_SETTINGS: MemberSettings = {
  registerEnabled: false,
  registerPath: "/user",
  nameRequired: true,
  passwordRequired: true,
  emailRequired: true,
  phoneRequired: false,
  captchaEnabled: false,
  inviteOnly: false,
  inviteCodes: [],
  defaultRole: "subscriber",
};

// 请求级去重：注册页 metadata + 渲染、注册/保存接口的门控读取同请求只算一次。
// 写路径（saveMemberSettings/registerMember）只取设置做决策与合并，最终值由
// setOption 回写并经 returning/返回值体现，不依赖读后写，缓存安全。
export const getMemberSettings = cache(async (): Promise<MemberSettings> => {
  const stored = (await getOption<Partial<MemberSettings>>(OPTION_KEY, {})) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
});

export async function saveMemberSettings(
  input: Partial<MemberSettings>,
): Promise<MemberSettings> {
  const current = await getMemberSettings();
  const next: MemberSettings = {
    registerEnabled:
      typeof input.registerEnabled === "boolean"
        ? input.registerEnabled
        : current.registerEnabled,
    registerPath:
      typeof input.registerPath === "string"
        ? input.registerPath
        : current.registerPath,
    nameRequired:
      typeof input.nameRequired === "boolean"
        ? input.nameRequired
        : current.nameRequired,
    passwordRequired:
      typeof input.passwordRequired === "boolean"
        ? input.passwordRequired
        : current.passwordRequired,
    emailRequired:
      typeof input.emailRequired === "boolean"
        ? input.emailRequired
        : current.emailRequired,
    phoneRequired:
      typeof input.phoneRequired === "boolean"
        ? input.phoneRequired
        : current.phoneRequired,
    captchaEnabled:
      typeof input.captchaEnabled === "boolean"
        ? input.captchaEnabled
        : current.captchaEnabled,
    inviteOnly:
      typeof input.inviteOnly === "boolean" ? input.inviteOnly : current.inviteOnly,
    // 每行一个码：去空白、去重、限长 64，最多 200 个。
    inviteCodes: Array.isArray(input.inviteCodes)
      ? [
          ...new Set(
            input.inviteCodes
              .map((c) => String(c).trim())
              .filter((c) => c.length > 0 && c.length <= 64),
          ),
        ].slice(0, 200)
      : current.inviteCodes,
    defaultRole:
      input.defaultRole === "subscriber" || input.defaultRole === "author"
        ? input.defaultRole
        : current.defaultRole,
  };

  next.registerPath = await normalizePublicPath(next.registerPath);

  // 不能与伪装后的后台登录入口落在同一 URL（catch-all 先判登录入口）。
  const sec = await getAdminSecurity();
  if (sec.entryEnabled && next.registerPath === sec.entryPath) {
    throw new ValidationError("注册路径不能与伪装登录入口相同，请更换");
  }

  await setOption(OPTION_KEY, next);
  return next;
}

/**
 * 伪装开启时，验证码图片等接口只允许秘密入口页或注册页作为 Referer。
 * 注册关闭时注册页不消费任何接口，一律按不匹配处理。
 */
export function isRegisterReferer(
  req: Request,
  member: MemberSettings,
): boolean {
  if (!member.registerEnabled) return false;
  let pathname = "";
  try {
    pathname = new URL(req.headers.get("referer") ?? "").pathname;
  } catch {
    pathname = "";
  }
  return pathname === member.registerPath;
}

/** 注册页公开配置（只暴露渲染表单必需的非敏感值）。 */
export const getPublicRegisterConfig = cache(async () => {
  const [member, sec, notify] = await Promise.all([
    getMemberSettings(),
    getAdminSecurity(),
    getNotifySettings(),
  ]);
  // 验证码投递必须对应通道真正可用，否则只显示输入框却永远收不到码。
  const emailVerify = notify.register.emailVerify && notify.email.enabled;
  const phoneVerify = notify.register.phoneVerify && notify.sms.enabled;
  if (!member.registerEnabled) {
    return {
      enabled: false,
      path: null,
      nameRequired: true,
      passwordRequired: true,
      emailRequired: true,
      phoneRequired: false,
      emailVerify: false,
      phoneVerify: false,
      defaultRole: "subscriber" as const,
      inviteOnly: false,
      captcha: { enabled: false, mode: null as null | "builtin" | "custom" },
    };
  }
  return {
    enabled: true,
    path: member.registerPath,
    nameRequired: member.nameRequired,
    passwordRequired: member.passwordRequired,
    emailRequired: member.emailRequired,
    phoneRequired: member.phoneRequired,
    emailVerify,
    phoneVerify,
    defaultRole: member.defaultRole,
    inviteOnly: member.inviteOnly,
    captcha: {
      enabled: member.captchaEnabled,
      mode: member.captchaEnabled ? sec.captchaMode : null,
    },
  };
});

/** 昵称：2~32 个非空白字符（支持中文），不允许 @（与邮箱登录区分）。 */
const NAME_RE = /^[^\s@]{2,32}$/u;

export type RegisterInput = {
  /** 昵称；nameRequired 关闭时可留空，由系统生成唯一昵称。 */
  name?: string;
  email?: string;
  phone?: string;
  /** 密码；passwordRequired 关闭时可留空（免密注册，事后可在账号中心补设）。 */
  password?: string;
  /** 邮箱验证码（notify.register.emailVerify 开启且填了邮箱时必填）。 */
  emailCode?: string;
  /** 手机验证码（notify.register.phoneVerify 开启且填了手机号时必填）。 */
  phoneCode?: string;
  /** 邀请码（inviteOnly 开启时必填，与管理员预设列表忽略大小写匹配）。 */
  inviteCode?: string;
};

/**
 * 手机号归一化：剔除空格与短横线。接受中国大陆 11 位手机号（1[3-9] 开头）
 * 或 E.164 国际格式（+ 开头、6~15 位数字），与 users.phone 的存储约定一致。
 */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

const PHONE_LOCAL_RE = /^1[3-9]\d{9}$/;
const PHONE_INTL_RE = /^\+\d{6,15}$/;

/**
 * 昵称非必填时的兜底生成器：「用户」+ 随机十六进制后缀，碰撞则重取，
 * 保证最终落库的昵称唯一且满足 NAME_RE（2~32 字符、无空格与 @）。
 */
async function generateUniqueName(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = `用户${crypto.randomBytes(4).toString("hex")}`;
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.name}) = lower(${candidate})`);
    if (!taken) return candidate;
  }
  // 理论上 10 次随机不会连续碰撞；退回时间戳后缀兜底。
  return `用户${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`.slice(0, 32);
}

/**
 * 公开联系方式目标的统一校验与归一化（注册与发送验证码接口共用同一套规则，
 * 避免两处格式判断漂移）。不合法直接抛 ValidationError。
 */
export function normalizeContactTarget(
  channel: "email" | "sms",
  raw: string,
): string {
  const v = raw.trim();
  if (channel === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 120) {
      throw new ValidationError("邮箱格式不正确");
    }
    return v;
  }
  const p = normalizePhone(v);
  if (!PHONE_LOCAL_RE.test(p) && !PHONE_INTL_RE.test(p)) {
    throw new ValidationError("手机号格式不正确");
  }
  return p;
}

/**
 * 公开自助注册。仅在总开关开启时可调用；成功后返回 SessionUser，
 * 由路由层直接写入会话 cookie（注册即登录，与参考站体验一致）。
 */
export async function registerMember(input: RegisterInput): Promise<SessionUser> {
  await ensureMigrations();
  const member = await getMemberSettings();
  if (!member.registerEnabled) throw new ValidationError("注册已关闭");

  // 邀请制：与预设列表忽略大小写匹配。
  if (member.inviteOnly) {
    const code = (input.inviteCode ?? "").trim();
    if (!code) throw new ValidationError("请填写邀请码");
    const hit = member.inviteCodes.some((c) => c.toLowerCase() === code.toLowerCase());
    if (!hit) throw new ValidationError("邀请码无效");
  }

  // 昵称：填了就按格式校验；留空时按开关决定报错或生成唯一兜底昵称。
  let name = input.name?.trim() ?? "";
  if (name) {
    if (!NAME_RE.test(name)) {
      throw new ValidationError("昵称需为 2~32 个字符，且不能包含空格或 @");
    }
  } else if (member.nameRequired) {
    throw new ValidationError("请填写昵称");
  } else {
    name = await generateUniqueName();
  }

  // 密码：填了校验长度；留空时按开关决定报错或免密注册（随机未知哈希 + 标记）。
  const passwordRaw = input.password ?? "";
  let passwordHash: string;
  let passwordless = false;
  if (passwordRaw) {
    if (passwordRaw.length < 8 || passwordRaw.length > 200) {
      throw new ValidationError("密码长度需为 8~200 个字符");
    }
    passwordHash = await hashPassword(passwordRaw);
  } else if (member.passwordRequired) {
    throw new ValidationError("请填写密码");
  } else {
    passwordHash = await hashPassword(crypto.randomBytes(24).toString("hex"));
    passwordless = true;
  }

  // 邮箱按配置决定必填；空串/缺省一律视为未填写。
  const emailRaw = input.email?.trim() || "";
  if (!emailRaw) {
    if (member.emailRequired) throw new ValidationError("请填写邮箱");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) || emailRaw.length > 120) {
    throw new ValidationError("邮箱格式不正确");
  }

  // 手机号同理：按配置决定必填，归一化后校验格式。
  const phoneRaw = normalizePhone(input.phone ?? "");
  if (!phoneRaw) {
    if (member.phoneRequired) throw new ValidationError("请填写手机号");
  } else if (!PHONE_LOCAL_RE.test(phoneRaw) && !PHONE_INTL_RE.test(phoneRaw)) {
    throw new ValidationError("手机号格式不正确");
  }

  // 邮箱 / 手机验证码：管理员开启对应通道后，填写了联系方式就必须校验通过。
  // 校验放在唯一性探测之前，避免注册接口成为账号是否存在的预言机。
  const notify = await getNotifySettings();
  if (notify.register.emailVerify && emailRaw) {
    await verifyCode({
      channel: "email",
      target: emailRaw,
      purpose: "register",
      code: input.emailCode ?? "",
    });
  }
  if (notify.register.phoneVerify && phoneRaw) {
    await verifyCode({
      channel: "sms",
      target: phoneRaw,
      purpose: "register",
      code: input.phoneCode ?? "",
    });
  }
  // 验证码校验通过即证明邮箱 / 手机所有权：verified 与是否「强制校验」一致。
  const emailVerifiedFlag = !!(emailRaw && notify.register.emailVerify);
  const phoneVerifiedFlag = !!(phoneRaw && notify.register.phoneVerify);

  // 唯一校验全部走不区分大小写比较，避免 "Tom"/"tom" 造成登录歧义；
  // 系统生成的昵称已保证唯一，这里仅需校验用户手填的昵称。
  if (input.name?.trim()) {
    const [nameTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.name}) = lower(${name})`);
    if (nameTaken) throw new ValidationError("昵称已被占用");
  }

  if (emailRaw) {
    const [emailTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${emailRaw})`);
    if (emailTaken) throw new ValidationError("邮箱已被注册");
  }

  // 手机号为纯数字/E.164，直接精确比较即可。
  if (phoneRaw) {
    const [phoneTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.phone} = ${phoneRaw}`);
    if (phoneTaken) throw new ValidationError("手机号已被注册");
  }

  const [row] = await db
    .insert(users)
    .values({
      name,
      email: emailRaw || null,
      phone: phoneRaw || null,
      passwordHash,
      role: member.defaultRole,
      emailVerified: emailVerifiedFlag,
      phoneVerified: phoneVerifiedFlag,
    })
    .returning();

  // 免密注册：落库成功后打 nopassword 标记，用户事后可在账号中心补设密码。
  if (passwordless) await addPasswordlessMark(row.id);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}
