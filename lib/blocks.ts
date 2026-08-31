/**
 * Block model for the visual editor.
 * Content is stored as an array of typed blocks (similar to WordPress blocks
 * or Sanity portable text) rather than a raw HTML string. This keeps the
 * source of truth structured and lets us render safely to HTML without
 * trusting user-supplied markup.
 *
 * The exception is the `html` block: it intentionally stores raw HTML written
 * by the (trusted) content author. It is rendered verbatim — never escaped —
 * so authors can embed arbitrary markup (iframes, callouts, custom layouts).
 */

export type Block =
  | { id: string; type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "image"; url: string; alt?: string; caption?: string }
  | { id: string; type: "quote"; text: string; cite?: string }
  | { id: string; type: "code"; language?: string; code: string }
  | { id: string; type: "list"; ordered?: boolean; items: string[] }
  | { id: string; type: "divider" }
  | { id: string; type: "html"; html: string };

export type BlockType = Block["type"];

export const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: "heading", label: "标题" },
  { type: "paragraph", label: "段落" },
  { type: "image", label: "图片" },
  { type: "quote", label: "引用" },
  { type: "code", label: "代码" },
  { type: "list", label: "列表" },
  { type: "divider", label: "分割线" },
  { type: "html", label: "HTML" },
];

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a single block to a safe HTML string. */
function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level, 1), 4);
      return `<h${level}>${escapeHtml(block.text)}</h${level}>`;
    }
    case "paragraph":
      return `<p>${escapeHtml(block.text).replace(/\n/g, "<br/>")}</p>`;
    case "image": {
      const img = `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(
        block.alt || "",
      )}" loading="lazy" />`;
      const caption = block.caption
        ? `<figcaption>${escapeHtml(block.caption)}</figcaption>`
        : "";
      return `<figure class="cms-figure">${img}${caption}</figure>`;
    }
    case "quote":
      return `<blockquote><p>${escapeHtml(block.text).replace(
        /\n/g,
        "<br/>",
      )}</p>${
        block.cite ? `<cite>— ${escapeHtml(block.cite)}</cite>` : ""
      }</blockquote>`;
    case "code":
      return `<pre data-lang="${escapeHtml(
        block.language || "text",
      )}"><code>${escapeHtml(block.code)}</code></pre>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((i) => `<li>${escapeHtml(i)}</li>`)
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "divider":
      return `<hr/>`;
    case "html":
      // Trusted author markup: rendered verbatim (NOT escaped).
      return block.html;
    default:
      return "";
  }
}

/** Serialize an array of blocks into a safe HTML string for rendering. */
export function serializeBlocks(blocks: Block[] | null | undefined): string {
  if (!blocks || blocks.length === 0) return "";
  return blocks.map(renderBlock).join("\n");
}

/** Extract plain text (e.g. for auto-generating an excerpt). */
export function blocksToPlainText(blocks: Block[] | null | undefined): string {
  if (!blocks) return "";
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
        case "paragraph":
        case "quote":
          return "text" in b ? b.text : "";
        case "image":
          return b.alt || b.caption || "";
        case "code":
          return b.code;
        case "list":
          return b.items.join(" ");
        case "html":
          // Strip tags to contribute readable text to the excerpt.
          return b.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        case "divider":
          return "";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" ");
}

export function emptyContent(): Block[] {
  return [];
}

/* ----------------------------------------------------------------------------
 * Markdown interoperability
 *
 * The editor stores content as structured `Block[]` (JSON). These two helpers
 * round-trip that structure with Markdown so authors can paste in `.md` from
 * anywhere (GitHub, Notion export, Obsidian) and export back to `.md`.
 *
 * The parser is intentionally dependency-free (no remark/unified) so it stays
 * tiny and works identically on the server and in the browser.
 * -------------------------------------------------------------------------- */

let mdSeq = 0;
function mdId(): string {
  mdSeq += 1;
  return `b_md_${Date.now().toString(36)}_${mdSeq}`;
}

function inlineToText(md: string): string {
  // We store inline text verbatim; the renderer escapes on output, so leaving
  // `*em*` / `[link](url)` as-is keeps the source Markdown readable and lets
  // the HTML renderer show the literal characters. If you later want inline
  // markdown rendering, expand this function.
  return md.replace(/ /g, " ");
}

/** Parse a Markdown string into a `Block[]` structure. */
export function markdownToBlocks(md: string): Block[] {
  const src = (md ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");
  const blocks: Block[] = [];

  let i = 0;
  let listBuffer: string[] = [];
  let listOrdered = false;
  let paragraphBuffer: string[] = [];

  function flushParagraph() {
    if (paragraphBuffer.length === 0) return;
    blocks.push({
      id: mdId(),
      type: "paragraph",
      text: inlineToText(paragraphBuffer.join("\n")),
    });
    paragraphBuffer = [];
  }

  function flushList() {
    if (listBuffer.length === 0) return;
    blocks.push({
      id: mdId(),
      type: "list",
      ordered: listOrdered,
      items: listBuffer.slice(),
    });
    listBuffer = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ``` or ~~~
    const fence = line.match(/^(```|~~~)(.*)$/);
    if (fence) {
      flushParagraph();
      flushList();
      const lang = fence[2].trim();
      const endMarker = fence[1];
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith(endMarker)) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({
        id: mdId(),
        type: "code",
        language: lang || undefined,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // ATX heading # .. ######
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(Math.max(heading[1].length, 1), 4) as 1 | 2 | 3 | 4;
      blocks.push({
        id: mdId(),
        type: "heading",
        level,
        text: inlineToText(heading[2].trim()),
      });
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ id: mdId(), type: "divider" });
      i += 1;
      continue;
    }

    // Image-only line: ![alt](url "caption")
    const img = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
    if (img) {
      flushParagraph();
      flushList();
      blocks.push({
        id: mdId(),
        type: "image",
        url: img[2],
        alt: img[1] || undefined,
        caption: img[3] || undefined,
      });
      i += 1;
      continue;
    }

    // Raw HTML block fence: <!--html--> ... <!--/html-->
    // (produced by blocksToMarkdown for the `html` block type). Supports the
    // opening and closing fences on their own lines OR on the same line.
    if (/^\s*<!--html-->/.test(line)) {
      flushParagraph();
      flushList();
      const open = line.replace(/^\s*<!--html-->/, "");
      const htmlLines: string[] = [];
      let rest = open;
      // Already has closing fence on the same line?
      const sameLineClose = rest.match(/^(.*?)<!--\/html-->\s*$/);
      if (sameLineClose) {
        blocks.push({ id: mdId(), type: "html", html: sameLineClose[1] });
        i += 1;
        continue;
      }
      if (rest.trim()) htmlLines.push(rest);
      i += 1;
      while (i < lines.length) {
        const close = lines[i].match(/^(.*?)<!--\/html-->\s*$/);
        if (close) {
          if (close[1].trim()) htmlLines.push(close[1]);
          break;
        }
        htmlLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence line
      blocks.push({ id: mdId(), type: "html", html: htmlLines.join("\n") });
      continue;
    }

    // Blockquote (one or more consecutive > lines)
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      flushList();
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      const joined = quoteLines.join("\n").trim();
      const citeMatch = joined.match(/\n—\s*(.+)$/) || joined.match(/\n>\s*(.+)$/);
      const text = citeMatch ? joined.replace(citeMatch[0], "").trim() : joined;
      const cite = citeMatch ? citeMatch[1].trim() : undefined;
      blocks.push({ id: mdId(), type: "quote", text: inlineToText(text), cite });
      continue;
    }

    // Unordered list item -, *, +
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    // Ordered list item 1. 2) etc.
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (ul || ol) {
      flushParagraph();
      const ordered = !!ol;
      if (listBuffer.length > 0 && ordered !== listOrdered) flushList();
      listOrdered = ordered;
      listBuffer.push(inlineToText((ul ?? ol)![1].trim()));
      i += 1;
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      i += 1;
      continue;
    }

    // Default: paragraph text (accumulate consecutive non-empty lines)
    flushList();
    paragraphBuffer.push(line);
    i += 1;
  }

  flushParagraph();
  flushList();
  return blocks;
}

/** Serialize a `Block[]` structure back into a Markdown string. */
export function blocksToMarkdown(blocks: Block[] | null | undefined): string {
  if (!blocks || blocks.length === 0) return "";
  const out: string[] = [];

  for (const b of blocks) {
    switch (b.type) {
      case "heading": {
        const hashes = "#".repeat(Math.min(Math.max(b.level, 1), 6));
        out.push(`${hashes} ${b.text}`);
        break;
      }
      case "paragraph":
        out.push(b.text);
        break;
      case "image":
        out.push(
          b.caption
            ? `![${b.alt ?? ""}](${b.url} "${b.caption}")`
            : `![${b.alt ?? ""}](${b.url})`,
        );
        break;
      case "quote":
        out.push(
          `> ${b.text.replace(/\n/g, "\n> ")}` +
            (b.cite ? `\n>\n> — ${b.cite}` : ""),
        );
        break;
      case "code":
        out.push("```" + (b.language ?? "") + "\n" + b.code + "\n```");
        break;
      case "list":
        b.items.forEach((item, idx) => {
          out.push(b.ordered ? `${idx + 1}. ${item}` : `- ${item}`);
        });
        break;
      case "html":
        // Round-trip raw HTML inside an HTML block comment fence so it stays
        // valid Markdown for other tools while preserving the markup.
        out.push(`<!--html-->${b.html}<!--/html-->`);
        break;
      case "divider":
        out.push("---");
        break;
    }
    out.push(""); // blank line between blocks
  }

  return out.join("\n").trim() + "\n";
}
