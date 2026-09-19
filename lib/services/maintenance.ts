import "server-only";
import { cache } from "react";
import { getOption, setOption } from "./options";
import { getSession } from "@/lib/auth";

/**
 * 维护模式（对标 WordPress 维护页 / Typecho 维护插件）。
 * 配置走 options KV（key=maintenanceSettings），免迁移。
 * 开启后前台所有内容路由向访客展示维护页；管理员 / 编辑等已登录后台用户
 * 照常访问，伪装入口与注册 / 找回密码页也始终放行（门控在 catch-all 中）。
 */

const OPTION_KEY = "maintenanceSettings";

export interface MaintenanceSettings {
  enabled: boolean;
  title: string;
  /** 维护说明正文（纯文本，前台按段落展示）。 */
  message: string;
}

const DEFAULT_SETTINGS: MaintenanceSettings = {
  enabled: false,
  title: "网站维护中",
  message: "站点正在进行例行维护，很快就会回来，请稍后再访问。",
};

export const getMaintenanceSettings = cache(async (): Promise<MaintenanceSettings> => {
  const stored = (await getOption<Partial<MaintenanceSettings>>(OPTION_KEY, {})) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
});

export async function saveMaintenanceSettings(
  input: Partial<MaintenanceSettings>,
): Promise<MaintenanceSettings> {
  const current = await getMaintenanceSettings();
  const next: MaintenanceSettings = {
    enabled:
      typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim().slice(0, 120)
        : current.title,
    message:
      typeof input.message === "string"
        ? input.message.slice(0, 1000)
        : current.message,
  };
  await setOption(OPTION_KEY, next);
  return next;
}

/**
 * 前台维护门控：维护开启且当前会话不是 admin / editor 时返回维护配置，
 * 调用方渲染维护屏；关闭或工作人员预览时返回 null。
 * 伪装登录入口、会员注册页在 catch-all 的 !res 分支先行解析，天然不经此门控；
 * 找回密码只走 /api 接口，也不受影响。
 */
export async function maintenanceGate(): Promise<MaintenanceSettings | null> {
  const settings = await getMaintenanceSettings();
  if (!settings.enabled) return null;
  const user = await getSession();
  if (user && (user.role === "admin" || user.role === "editor")) return null;
  return settings;
}
