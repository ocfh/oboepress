import type { CSSProperties } from "react";

/** Static asset URL of a prebuilt icon SVG (see scripts/gen-icon-assets.cjs). */
export function iconUrl(name: string): string {
  return `/icons/${name}.svg`;
}

/**
 * Client-side icon preview backed by a prebuilt static SVG in /public/icons.
 *
 * The SVG is applied as a CSS mask and filled with `currentColor`, so the
 * glyph inherits the surrounding text color (hover / active states included)
 * without shipping the lucide icon components to the browser.
 */
export default function IconGlyph({
  name,
  size = 16,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const url = `url(${iconUrl(name)})`;
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={
        {
          width: size,
          height: size,
          backgroundColor: "currentColor",
          WebkitMaskImage: url,
          maskImage: url,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          ...style,
        } satisfies CSSProperties
      }
    />
  );
}
