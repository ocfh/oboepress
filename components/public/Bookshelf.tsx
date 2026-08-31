import { listPages } from "@/lib/services/pages";
import { buildPageTree } from "@/lib/page-tree";
import BookCard3D from "./BookCard3D";

/**
 * 3D Bookshelf homepage — mimics the Panda Studio docs site.
 * Books are arranged in rows on shelves with 3D perspective transforms.
 */
export default async function Bookshelf() {
  const { items } = await listPages({ status: "published", limit: 50 });

  // Group into rows of 5
  const rows: typeof items[] = [];
  for (let i = 0; i < items.length; i += 5) {
    rows.push(items.slice(i, i + 5));
  }

  return (
    <div className="bookshelf-container">
      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-color-3)" }}>
          <BookOpen size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
          <p>还没有文档页面，请先在后台创建。</p>
        </div>
      ) : (
        rows.map((row, rowIndex) => (
          <div key={rowIndex} className="bookshelf-row">
            {row.map((page, i) => (
              <BookCard3D key={page.id} page={page} index={rowIndex * 5 + i} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function BookOpen({ size, style }: { size: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
