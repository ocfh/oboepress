import { NextResponse } from "next/server";
import { authenticate, authorize, handleError } from "@/lib/http";
import * as posts from "@/lib/services/posts";
import * as pages from "@/lib/services/pages";
import { listComments } from "@/lib/services/comments";
import { listCategories, listTags } from "@/lib/services/taxonomies";
import { getSettings } from "@/lib/services/settings";
import type { Block } from "@/lib/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 可导出的数据范围，白名单同时用于校验 query 参数。
const SCOPES = ["posts", "pages", "comments", "taxonomies", "settings"] as const;
type Scope = (typeof SCOPES)[number];

// 分批拉全量，绕开各 service 的单次 limit 上限。
async function paginate<T>(
  fetchPage: (offset: number) => Promise<{ items: T[]; total: number }>,
  size: number,
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += size) {
    const { items, total } = await fetchPage(offset);
    all.push(...items);
    if (items.length === 0 || all.length >= total) break;
  }
  return all;
}

function download(filename: string, type: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// --- Markdown 渲染（仅依赖内置 Block 结构，零新依赖） ---

function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `${"#".repeat(b.level)} ${b.text}`;
        case "paragraph":
          return b.text;
        case "image":
          return `![${b.alt ?? ""}](${b.url})${b.caption ? `\n\n*${b.caption}*` : ""}`;
        case "quote":
          return `> ${b.text.split(/\r?\n/).join("\n> ")}${b.cite ? `\n>\n> — ${b.cite}` : ""}`;
        case "code":
          return `\`\`\`${b.language ?? ""}\n${b.code}\n\`\`\``;
        case "list":
          return b.items
            .map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`))
            .join("\n");
        case "divider":
          return "---";
        case "html":
          return b.html;
      }
    })
    .join("\n\n");
}

function entryMeta(e: Record<string, unknown>): string {
  const lines = [
    `- 别名：${String(e.slug ?? "")}`,
    `- 状态：${String(e.status ?? "")}`,
    e.createdAt ? `- 创建时间：${new Date(e.createdAt as string).toISOString()}` : null,
    e.updatedAt ? `- 更新时间：${new Date(e.updatedAt as string).toISOString()}` : null,
    e.excerpt ? `- 摘要：${String(e.excerpt).replace(/\r?\n/g, " ")}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function toMarkdown(data: Record<string, unknown>): string {
  const out: string[] = [
    "# OboePress 内容导出",
    "",
    `> 导出时间：${String(data.exportedAt)}`,
    "",
  ];

  const list = data.posts as Record<string, unknown>[] | undefined;
  if (list) {
    out.push("# 文章", "");
    for (const p of list) {
      const cats = ((p.categories as { name: string }[]) ?? []).map((c) => c.name).join("、");
      const tags = ((p.tags as { name: string }[]) ?? []).map((t) => t.name).join("、");
      out.push(
        ...[
          `## ${String(p.title)}`,
          "",
          entryMeta(p),
          cats ? `- 分类：${cats}` : null,
          tags ? `- 标签：${tags}` : null,
          "",
          blocksToMarkdown((p.content as Block[]) ?? []),
          "",
          "---",
          "",
        ].filter((l): l is string => l !== null),
      );
    }
  }

  const pages = data.pages as Record<string, unknown>[] | undefined;
  if (pages) {
    out.push("# 独立页面", "");
    for (const p of pages) {
      out.push(
        `## ${String(p.title)}`,
        "",
        entryMeta(p),
        "",
        blocksToMarkdown((p.content as Block[]) ?? []),
        "",
        "---",
        "",
      );
    }
  }

  const tax = data.taxonomies as
    | { categories: { name: string; slug: string }[]; tags: { name: string; slug: string }[] }
    | undefined;
  if (tax) {
    out.push("# 分类与标签", "", "## 分类", "");
    for (const c of tax.categories) out.push(`- ${c.name}（${c.slug}）`);
    out.push("", "## 标签", "");
    for (const t of tax.tags) out.push(`- ${t.name}（${t.slug}）`);
    out.push("");
  }

  const comments = data.comments as Record<string, unknown>[] | undefined;
  if (comments) {
    out.push("# 评论", "");
    for (const c of comments) {
      out.push(
        `- [${String(c.status)}] ${String(c.authorName ?? "")} 于 ${new Date(
          c.createdAt as string,
        ).toISOString()} 评论 ${String(c.postType ?? "")}#${String(c.postId ?? "")}：${String(
          c.content ?? "",
        ).replace(/\r?\n/g, " ")}`,
      );
    }
    out.push("");
  }

  const settings = data.settings as Record<string, unknown> | undefined;
  if (settings) {
    out.push("# 站点设置", "");
    for (const [k, v] of Object.entries(settings)) {
      out.push(`- **${k}**：${v === null || v === undefined ? "" : String(v)}`);
    }
  }

  return out.filter((l) => l !== null).join("\n");
}

export async function GET(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;

    const url = new URL(req.url);
    const picked = url.searchParams.getAll("scope");
    const scopes: Scope[] = picked.length
      ? (picked.filter((s) => (SCOPES as readonly string[]).includes(s)) as Scope[])
      : [...SCOPES];
    if (!scopes.length) {
      return new NextResponse("至少选择一个导出范围", { status: 400 });
    }
    const markdown = url.searchParams.get("format") === "markdown";

    // 组装导出数据（日期由 JSON 原生序列化为 ISO 字符串）
    const data: Record<string, unknown> = {
      tool: "OboePress",
      version: 1,
      exportedAt: new Date().toISOString(),
    };
    if (scopes.includes("posts")) {
      data.posts = await paginate((offset) => posts.listPosts({ limit: 100, offset }), 100);
    }
    if (scopes.includes("pages")) {
      // listPages 不含 metas，逐条补全（独立页面数量通常很少）
      const rows = await paginate((offset) => pages.listPages({ limit: 100, offset }), 100);
      data.pages = await Promise.all(rows.map((p) => pages.getPageById(p.id, true)));
    }
    if (scopes.includes("comments")) {
      const rows = await paginate((offset) => listComments({ limit: 200, offset }), 200);
      // avatarUrl 是按设置实时推导的派生字段，不进备份
      data.comments = rows.map(({ avatarUrl: _omit, ...rest }) => rest);
    }
    if (scopes.includes("taxonomies")) {
      data.taxonomies = {
        categories: await listCategories(),
        tags: await listTags(),
      };
    }
    if (scopes.includes("settings")) {
      data.settings = await getSettings();
    }

    const stamp = new Date().toISOString().slice(0, 10);
    if (markdown) {
      return download(`oboepress-export-${stamp}.md`, "text/markdown; charset=utf-8", toMarkdown(data));
    }
    return download(
      `oboepress-export-${stamp}.json`,
      "application/json; charset=utf-8",
      JSON.stringify(data, null, 2),
    );
  } catch (e) {
    return handleError(e);
  }
}
