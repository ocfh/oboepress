import type { LucideIcon } from "lucide-react";
import {
  Circle,
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
  adminOnly?: boolean;
  superOnly?: boolean;
};

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
};