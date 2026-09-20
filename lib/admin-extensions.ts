import type { LucideIcon } from "lucide-react";
import {
  Circle,
  LayoutDashboard,
  Plug,
  Rocket,
  Wand2,
  Activity,
  Settings,
  Star,
  Shield,
  Boxes,
  LayoutGrid,
  Pin,
  Link2,
  Palette,
  Book,
  Globe,
} from "lucide-react";

/** Serializable description added to the admin sidebar via the `admin.menu` hook.
 *  Icons are referenced by name because a server-collected payload cannot carry a
 *  client component across the RSC boundary; AdminShell maps the name to lucide. */
export type AdminMenuItem = {
  href: string;
  label: string;
  /** lucide icon name (map in AdminShell); fallback to a generic dot. */
  icon?: string;
  exact?: boolean;
  /** 外链（http/https）时后台渲染为新标签页打开的 <a>，而非路由跳转。 */
  external?: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
};

/**
 * 一级菜单描述：插件可在 `admin.menu` 钩子里返回本对象（与普通二级项混在
 * items 数组中即可），把自己的入口提升为独立一级菜单。多个插件用相同
 * `section` id 注册时会合并进同一个一级菜单；不注册就继续待在「扩展」组，
 * 完全自愿。主题则在 manifest.json 里用同名结构声明 adminMenu。
 */
export type AdminMenuSection = {
  /** 一级菜单唯一 id（同 id 合并）；主题内部使用 `theme:<slug>`。 */
  section: string;
  label: string;
  icon?: string;
  adminOnly?: boolean;
  superOnly?: boolean;
  items: AdminMenuItem[];
};

/** admin.menu 钩子 items 数组的成员：二级项或一级菜单。 */
export type AdminMenuEntry = AdminMenuItem | AdminMenuSection;

export function isAdminMenuSection(entry: AdminMenuEntry): entry is AdminMenuSection {
  return typeof (entry as AdminMenuSection)?.section === "string" &&
    Array.isArray((entry as AdminMenuSection).items);
}

/** Serializable stat card added to the dashboard via the `dashboard.cards` hook. */
export type DashboardCardItem = {
  label: string;
  value: string | number;
  /** arbitrary extra hint text rendered under the value */
  sub?: string;
  href?: string;
};

/** lucide icon-name registry shared between core and hooked sidebar items. */
export const ADMIN_ICONS: Record<string, LucideIcon> = {
  filetext: Circle, // CLI cannot statically resolve every export; core uses direct imports.
  dashboard: LayoutDashboard,
  plugin: Plug,
  rocket: Rocket,
  wand: Wand2,
  activity: Activity,
  settings: Settings,
  star: Star,
  shield: Shield,
  boxes: Boxes,
  layoutgrid: LayoutGrid,
  pin: Pin,
  link: Link2,
  palette: Palette,
  book: Book,
  globe: Globe,
};
