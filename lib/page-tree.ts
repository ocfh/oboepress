import type { Page } from "@/db/schema";

export type PageTreeNode = {
  id: number;
  title: string;
  slug: string;
  children: PageTreeNode[];
  order: number;
};

/**
 * Build a hierarchical page tree from a flat list.
 * Uses parentId for nesting; pages without a parent become root nodes.
 */
export function buildPageTree(pages: Page[]): PageTreeNode[] {
  const nodeMap = new Map<number, PageTreeNode>();
  const roots: PageTreeNode[] = [];

  // First pass: create all nodes
  pages.forEach((page, index) => {
    nodeMap.set(page.id, {
      id: page.id,
      title: page.title,
      slug: page.slug,
      children: [],
      order: index,
    });
  });

  // Second pass: link children to parents
  pages.forEach((page) => {
    const node = nodeMap.get(page.id)!;
    if (page.parentId && nodeMap.has(page.parentId)) {
      nodeMap.get(page.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

/**
 * Flatten a page tree into a list with depth info (for sidebar rendering).
 */
export function flattenPageTree(
  nodes: PageTreeNode[],
  depth = 0,
): { node: PageTreeNode; depth: number }[] {
  const result: { node: PageTreeNode; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.children.length > 0) {
      result.push(...flattenPageTree(node.children, depth + 1));
    }
  }
  return result;
}

/**
 * Extract headings from rendered HTML for table of contents.
 */
export function extractHeadings(html: string): { id: string; text: string; level: number }[] {
  const headings: { id: string; text: string; level: number }[] = [];
  const regex = /<h([2-4])[^>]*>(.*?)<\/h\1>/gi;
  let match;
  let index = 0;
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    const id = `heading-${index++}`;
    headings.push({ id, text, level });
  }
  return headings;
}
