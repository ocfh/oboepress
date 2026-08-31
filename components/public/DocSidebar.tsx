import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buildPageTree } from "@/lib/page-tree";
import { listPages } from "@/lib/services/pages";
import type { PageTreeNode } from "@/lib/page-tree";

function TreeNode({
  node,
  depth,
  currentSlug,
}: {
  node: PageTreeNode;
  depth: number;
  currentSlug: string;
}) {
  const isActive = currentSlug === node.slug;

  return (
    <li>
      <Link
        href={`/pages/${node.slug}`}
        className="panda-sidebar-item"
        style={{ paddingLeft: `${depth * 16 + 20}px` }}
      >
        {node.children.length > 0 && (
          <ChevronRight
            size={14}
            style={{
              opacity: 0.5,
              transform: isActive ? "rotate(90deg)" : "none",
              transition: "transform 0.25s",
            }}
          />
        )}
        <span style={{ color: isActive ? "var(--primary-color)" : undefined }}>{node.title}</span>
      </Link>
      {node.children.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} currentSlug={currentSlug} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function DocSidebar({ currentSlug }: { currentSlug: string }) {
  const { items } = await listPages({ status: "published", limit: 100 });
  const tree = buildPageTree(items);

  return (
    <nav>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {tree.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} currentSlug={currentSlug} />
        ))}
      </ul>
    </nav>
  );
}
