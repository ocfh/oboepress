import Link from "next/link";
import { BookOpen, Pen, Shirt, FolderOpen, User } from "lucide-react";
import { buildPageTree, flattenPageTree } from "@/lib/page-tree";
import { listPages } from "@/lib/services/pages";

export default async function PandaSidebar({ currentSlug }: { currentSlug?: string }) {
  const { items: allPages } = await listPages({ status: "published", limit: 100 });
  const tree = buildPageTree(allPages);
  const flat = flattenPageTree(tree);

  return (
    <aside className="panda-sidebar">
      {/* Bookshelf section */}
      <div className="panda-sidebar-section">
        <div className="panda-sidebar-title">
          <BookOpen size={14} />
          书架
        </div>
        <ul>
          <li>
            <Link
              href="/"
              className={`panda-sidebar-item ${!currentSlug ? "active" : ""}`}
            >
              <BookOpen size={16} />
              全部文档
            </Link>
          </li>
          {flat.map(({ node, depth }) => (
            <li key={node.id}>
              <Link
                href={`/pages/${node.slug}`}
                className="panda-sidebar-item"
                style={{ paddingLeft: `${depth * 16 + 20}px` }}
              >
                {node.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* nvPress section */}
      <div className="panda-sidebar-section">
        <div className="panda-sidebar-title">
          <Pen size={14} />
          nvPress
        </div>
        <ul>
          <li>
            <Link href="/blog" className="panda-sidebar-item">
              <Pen size={16} />
              博客文章
            </Link>
          </li>
        </ul>
      </div>

      {/* Themes */}
      <div className="panda-sidebar-section">
        <div className="panda-sidebar-title">
          <Shirt size={14} />
          我的主题
        </div>
      </div>

      {/* Resources */}
      <div className="panda-sidebar-section">
        <div className="panda-sidebar-title">
          <FolderOpen size={14} />
          资源
        </div>
        <ul>
          <li>
            <Link href="/blog" className="panda-sidebar-item">
              <FolderOpen size={16} />
              文件夹
            </Link>
          </li>
        </ul>
      </div>

      {/* User area */}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #00185e18" }}>
        <Link href="/admin/login" className="panda-sidebar-item">
          <div style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "#c7d2fe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <User size={14} color="#64748b" />
          </div>
          <span style={{ color: "var(--text-color-3)", fontSize: 13 }}>未登录</span>
        </Link>
      </div>
    </aside>
  );
}
