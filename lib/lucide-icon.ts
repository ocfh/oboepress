import { icons, type LucideIcon } from "lucide-react";
import { isValidLucideIconName, lucidePascalName } from "./icon-names";

/**
 * Server-only lookup of a Lucide component by kebab-case identifier.
 * Do NOT import this from client components — referencing the full `icons`
 * map pulls every icon into the client bundle. Client surfaces should render
 * prebuilt static SVGs via <IconGlyph> (/public/icons) instead.
 */
const ICON_MAP = icons as unknown as Record<string, LucideIcon>;

export function getLucideIcon(
  kebab: string | null | undefined,
): LucideIcon | null {
  if (!kebab || !isValidLucideIconName(kebab)) return null;
  return ICON_MAP[lucidePascalName(kebab)] ?? null;
}
