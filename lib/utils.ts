export function slugify(input: string): string {
  const base = input
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "item";
}

/** Ensure a slug is unique by appending -2, -3, ... against an existing set. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

export function excerptFrom(text: string, max = 160): string {
  // 摘要用于 SEO 描述与列表预览，必须剔除短代码标记（含成对短代码内部文本），
  // 否则 [friendlinks] 之类会原样泄漏到 meta description。
  const withoutShortcodes = text
    .replace(/\[(\w+)[^\]]*\][\s\S]*?\[\/\1\]/g, " ")
    .replace(/\[\w+[^\]]*\]/g, " ");
  const clean = withoutShortcodes.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}
